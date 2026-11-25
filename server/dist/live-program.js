import { randomInt } from 'node:crypto';
export const isReply = (source) => !['host', 'opening', 'standby'].includes(source);
export class UnresolvedLiveVideo extends Error {
    receiptPath;
    constructor(receiptPath, cause) {
        super('Live video submission unresolved. Check the existing receipt: ' + receiptPath, { cause });
        this.receiptPath = receiptPath;
    }
}
/** Pending viewer clips get the next free slot. Submitted renders keep theirs to completion. */
export class LiveRenderPool {
    limit;
    active = 0;
    waiting = [];
    unresolved;
    constructor(limit) {
        this.limit = limit;
    }
    get paused() { return this.unresolved; }
    run(viewer, render) {
        if (this.unresolved)
            return Promise.reject(this.unresolved);
        return new Promise((resolve, reject) => {
            const start = () => {
                this.active++;
                Promise.resolve().then(render).then(resolve, error => {
                    if (error instanceof UnresolvedLiveVideo && !this.unresolved) {
                        this.unresolved = error;
                        for (const queued of this.waiting.splice(0))
                            queued.reject(error);
                    }
                    reject(error);
                }).finally(() => {
                    this.active--;
                    const viewerIndex = this.waiting.findIndex(job => job.viewer);
                    this.waiting.splice(Math.max(0, viewerIndex), 1)[0]?.start();
                });
            };
            if (this.active < this.limit)
                start();
            else
                this.waiting.push({ viewer, start, reject });
        });
    }
}
/** Keep only the next decoded FAQ on standby. New bodies join the current shuffle. */
export class FaqRotation {
    bodies = new Set();
    remaining = [];
    last;
    add(text) {
        if (this.bodies.has(text))
            return;
        this.bodies.add(text);
        this.remaining.push(text);
    }
    next() {
        if (!this.remaining.length)
            this.remaining = [...this.bodies];
        if (!this.remaining.length)
            return;
        const eligible = this.remaining.filter(text => text !== this.last);
        const choices = eligible.length ? eligible : this.remaining;
        const next = choices[randomInt(choices.length)];
        this.remaining.splice(this.remaining.indexOf(next), 1);
        this.last = next;
        return next;
    }
}
// History advances when the encoder takes a clip, including the words now on air.
// A rendered host clip can still be displaced by a viewer, so keep it separate.
export class LiveProgram {
    release;
    ready = [];
    history = [];
    answeredBodies = new Set();
    chat = [];
    contextVersion = 0;
    spokenStandby = [];
    faqStandby;
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
            scheduledReplies: [...this.ready.filter(item => isReply(item.source) && !item.address).map(item => ({ host: item.text, answering: item.question })), ...this.draftingReplies.values()]
        };
    }
    get version() { return this.contextVersion; }
    get readyReplies() { return this.ready.filter(item => isReply(item.source) && !item.address).length; }
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
    dropFailedReply(key) {
        if (this.draftingReplies.delete(key))
            this.changeContext();
    }
    queueReply(clip, alreadyPlanned = false) {
        if (!alreadyPlanned)
            this.changeContext();
        this.ready.push(clip);
    }
    // The caller serializes identical bodies while allowing different questions to render concurrently.
    async offerReply(body, address, renderAddress, onAddressError) {
        if (address && !this.answeredBodies.has(body.text)) {
            try {
                const clip = await renderAddress(address);
                this.queueReply({ ...clip, source: body.source, id: body.id, text: address, address: true }, true);
            }
            catch (error) {
                onAddressError(error);
            }
        }
        this.queueReply(body, true);
        this.answeredBodies.add(body.text);
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
        else if (allowHost && this.faqStandby && this.faqStandby.text !== this.history.at(-1)?.host) {
            clip = this.faqStandby;
            this.faqStandby = undefined;
        }
        else if (allowHost) {
            const next = this.spokenStandby.findIndex(item => (!awaitingViewer || item.source === 'standby') && item.text !== this.history.at(-1)?.host);
            if (next >= 0) {
                [clip] = this.spokenStandby.splice(next, 1);
            }
        }
        if (!clip || clip.address)
            return clip;
        if (clip.replay || clip.source === 'standby') {
            const text = clip.text;
            this.history = this.history.filter(turn => turn.answering || turn.host !== text);
        }
        this.history.push({ host: clip.text, ...(clip.question && { answering: clip.question }) });
        this.history = this.history.slice(-12);
        return clip;
    }
}
