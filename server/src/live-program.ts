import type { Utterance } from './live-encoder.js';
import type { ChatMessage } from './live-character.js';

export const isReply = (source: string) => source !== 'host' && source !== 'opening';

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
  private replies = 0;

  constructor(private release: (clip: Utterance) => void) {}

  hear(event: ChatMessage) {
    this.chat.push({ speaker: event.speaker, text: event.text });
    this.chat = this.chat.slice(-12);
  }

  context() {
    return {
      onAir: this.history.slice(),
      recentChat: this.chat.slice(),
      scheduledHost: this.ready.filter(item => !isReply(item.source)).map(item => item.text),
      scheduledReplies: this.ready.filter(item => isReply(item.source)).map(item => ({ host: item.text, answering: item.question }))
    };
  }

  get version() { return this.replies; }
  get readyReplies() { return this.ready.filter(item => isReply(item.source)).length; }
  get canPlanHost() {
    return this.history.length > 0 && this.readyReplies === 0 && this.ready.length < 2;
  }

  queueReply(clip: Utterance) {
    this.replies++;
    for (let i = this.ready.length - 1; i >= 0; i--) {
      if (this.ready[i].source === 'host') this.release(this.ready.splice(i, 1)[0]);
    }
    this.ready.push(clip);
  }

  take(roomLive: boolean, allowHost = true) {
    if (this.ready[0]?.source === 'opening' && !roomLive) return;
    const index = this.ready.findIndex(item => item.source !== 'host' || allowHost);
    if (index < 0) return;
    const [clip] = this.ready.splice(index, 1);
    this.history.push({ host: clip.text, ...(clip.question && { answering: clip.question }) });
    this.history = this.history.slice(-12);
    return clip;
  }
}
