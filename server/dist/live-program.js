export const isReply = (source) => !['host', 'opening', 'standby'].includes(source);
/** Pending viewer clips get the next free slot. Submitted renders keep theirs to completion. */
export class LiveRenderPool {
    limit;
    active = 0;
    waiting = [];
    constructor(limit) {
        this.limit = limit;
    }
    run(viewer, render) {
        return new Promise((resolve, reject) => {
            const start = () => {
                this.active++;
                Promise.resolve().then(render).then(resolve, reject).finally(() => {
                    this.active--;
                    const viewerIndex = this.waiting.findIndex(job => job.viewer);
                    this.waiting.splice(Math.max(0, viewerIndex), 1)[0]?.start();
                });
            };
            if (this.active < this.limit)
                start();
            else
                this.waiting.push({ viewer, start });
        });
    }
}
// History advances when the encoder takes a clip, including the words now on air.
// A rendered host clip can still be displaced by a viewer, so keep it separate.
export class LiveProgram {
    release;
    ready = [];
    history = [];
    chat = [];
    contextVersion = 0;
    spokenStandby = [];
    draftingHosts = new Map();
    draftingReplies = new Map();
    constructor(release) {
        this.release = release;
    }
    hear(event) {
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
            if (this.ready[i].source === 'host')
                this.release(this.ready.splice(i, 1)[0]);
        }
    }
    queueReply(clip, alreadyPlanned = false) {
        if (!alreadyPlanned)
            this.changeContext();
        this.ready.push(clip);
    }
    addStandby(clip) { this.spokenStandby.push(clip); }
    finish(clip) {
        if (!['standby', 'host'].includes(clip.source) || !clip.reusable || clip.question) {
            this.release(clip);
            return;
        }
        clip.replay = true;
        this.spokenStandby.push(clip);
        // Each decoded portrait occupies hundreds of MB. Rotate only a small working set.
        if (this.spokenStandby.length > 6) {
            const oldestHost = this.spokenStandby.findIndex(item => item.source === 'host');
            if (oldestHost >= 0)
                this.release(this.spokenStandby.splice(oldestHost, 1)[0]);
        }
    }
    take(roomLive, allowHost = true, awaitingViewer = false) {
        if (!roomLive)
            return;
        let index = this.ready.findIndex(item => item.source === 'opening');
        if (index < 0)
            index = this.ready.findIndex(item => isReply(item.source));
        if (index < 0 && allowHost && !awaitingViewer && this.ready.length)
            index = 0;
        let clip;
        if (index >= 0)
            [clip] = this.ready.splice(index, 1);
        else if (allowHost) {
            const next = this.spokenStandby.findIndex(item => (!awaitingViewer || item.source === 'standby') && item.text !== this.history.at(-1)?.host);
            if (next >= 0) {
                [clip] = this.spokenStandby.splice(next, 1);
            }
        }
        if (!clip)
            return;
        if (clip.replay || clip.source === 'standby') {
            const text = clip.text;
            this.history = this.history.filter(turn => turn.answering || turn.host !== text);
        }
        this.history.push({ host: clip.text, ...(clip.question && { answering: clip.question }) });
        this.history = this.history.slice(-12);
        return clip;
    }
}
