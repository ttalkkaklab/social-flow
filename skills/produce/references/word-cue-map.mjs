// word-cues.py TSV uses absolute seconds; render groups use local milliseconds.
export function parseWordCues(text, startMs, durationMs) {
  const offsets=[];
  let mode='provided',previous=-Infinity;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    if(line.startsWith('#')){if(line.includes('proportional'))mode='proportional';else if(line.includes('aligned')&&mode!=='proportional')mode='aligned';continue;}
    const columns=line.split('\t');
    const start=Number(columns[0]),end=Number(columns[1]);
    if(columns.length<3 || !columns[0].trim() || !columns[1].trim() || !Number.isFinite(start) || !Number.isFinite(end) || end<start)
      throw new Error('word cue needs finite start, end and word TSV columns');
    const ms=Math.round(start*1000-startMs);
    if(ms<0 || ms>=durationMs || ms<previous)throw new Error('word cue onset is outside its segment or out of order');
    offsets.push(ms);previous=ms;
  }
  if(!offsets.length)throw new Error('word cue file contains no onsets');
  return {offsets,mode};
}
