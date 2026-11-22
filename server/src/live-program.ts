import type { Utterance } from './live-encoder.js';
import type { ChatMessage } from './live-character.js';

export const isReply = (source: string) => !['host', 'opening', 'standby'].includes(source);

/** Pending viewer clips get the next free slot. Submitted renders keep theirs to completion. */
export class LiveRenderPool {
  private active = 0;
  private waiting: { viewer: boolean; start: () => void }[] = [];

  constructor(readonly limit: number) {}

  run<T>(viewer: boolean, render: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        Promise.resolve().then(render).then(resolve, reject).finally(() => {
          this.active--;
          const viewerIndex = this.waiting.findIndex(job => job.viewer);
          this.waiting.splice(Math.max(0, viewerIndex), 1)[0]?.start();
        });
      };
      if (this.active < this.limit) start();
      else this.waiting.push({ viewer, start });
    });
  }
}

interface SpokenTurn {
  host: string;
  answering?: Pick<ChatMessage, 'speaker' | 'text'>;
}

// History advances when the encoder takes a clip, including the words now on air.
// A rendered host clip can still be displaced by a viewer, so keep it separate.
export class LiveProgram {
  readonly ready: Utterance[] = [];
  private history: SpokenTurn[] = [];
  private chat: Pick<ChatMessage, 'speaker' | 'text'>[] = [];
  private contextVersion = 0;
  private spokenStandby: Utterance[] = [];
  readonly draftingHosts = new Map<string, string>();
  readonly draftingReplies = new Map<string, SpokenTurn>();

  constructor(private release: (clip: Utterance) => void) {}

  hear(event: ChatMessage) {
    this.chat.push({ speaker: event.speaker, text: event.text });
    this.chat = this.chat.slice(-12);
  }

  context() {
    return {
      onAir: this.history.slice(),
      recentChat: this.chat.slice(),
      scheduledHost: [...this.ready.filter(item => !isReply(item.source)).map(item => item.text), ...this.draftingHosts.values()],
      scheduledReplies: [...this.ready.filter(item => isReply(item.source)).map(item => ({ host: item.text, answering: item.question })), ...this.draftingReplies.values()]
    };
  }

  get version() { return this.contextVersion; }
  get readyReplies() { return this.ready.filter(item => isReply(item.source)).length; }
  get canPlanHost() {
    return this.history.length > 0;
  }

  changeContext() {
    this.contextVersion++;
    this.draftingHosts.clear();
    for (let i = this.ready.length - 1; i >= 0; i--) {
      if (this.ready[i].source === 'host') this.release(this.ready.splice(i, 1)[0]);
    }
  }

  queueReply(clip: Utterance, alreadyPlanned = false) {
    if (!alreadyPlanned) this.changeContext();
    this.ready.push(clip);
  }

  addStandby(clip: Utterance) { this.spokenStandby.push(clip); }

  finish(clip: Utterance) {
    if (!['standby','host'].includes(clip.source) || !clip.reusable || clip.question) {
      this.release(clip);
      return;
    }
    clip.replay = true;
    this.spokenStandby.push(clip);
    // Each decoded portrait occupies hundreds of MB. Rotate only a small working set.
    if (this.spokenStandby.length > 6) {
      const oldestHost = this.spokenStandby.findIndex(item => item.source === 'host');
      if (oldestHost >= 0) this.release(this.spokenStandby.splice(oldestHost,1)[0]);
    }
  }

  take(roomLive: boolean, allowHost = true, awaitingViewer = false) {
    if (!roomLive) return;
    let index = this.ready.findIndex(item => item.source === 'opening');
    if (index < 0) index = this.ready.findIndex(item => isReply(item.source));
    if (index < 0 && allowHost && !awaitingViewer && this.ready.length) index = 0;
    let clip: Utterance | undefined;
    if (index >= 0) [clip] = this.ready.splice(index, 1);
    else if (allowHost) {
      const next = this.spokenStandby.findIndex(item =>
        (!awaitingViewer || item.source === 'standby') && item.text !== this.history.at(-1)?.host);
      if (next >= 0) {
        [clip] = this.spokenStandby.splice(next, 1);
      }
    }
    if (!clip) return;
    if (clip.replay || clip.source === 'standby') {
      const text = clip.text;
      this.history = this.history.filter(turn => turn.answering || turn.host !== text);
    }
    this.history.push({ host: clip.text, ...(clip.question && { answering: clip.question }) });
    this.history = this.history.slice(-12);
    return clip;
  }
}
