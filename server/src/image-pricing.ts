import { gptImageContract } from './image-models.js';
/** No output-only flat price is presented as a total bill. */
export function imageQuote(engine: string, model: string | undefined, reserveUsd?: number) {
  if (['astra-genai', 'astra-genai-native'].includes(engine)) {
    if (reserveUsd === undefined || !Number.isFinite(reserveUsd) || reserveUsd < 0)
      throw new Error('image_quote_required: supply explicit reserveUsd for GenAI; pricing is unverified');
    return { reserveUsd, basis: 'Caller reservation; gateway pricing unverified, not a provider invoice cap', revision: '2026-10-18' };
  }
  if (engine !== 'gpt-image') {
    if (reserveUsd !== undefined && reserveUsd !== 0) throw new Error('Local/host API reservation must be zero');
    return { reserveUsd: 0, basis: 'No separate API bill; hardware/subscription excluded', revision: '2026-10-18' };
  }
  if (!Number.isFinite(reserveUsd) || (reserveUsd ?? 0) <= 0) throw new Error('image_quote_required: supply a positive reserveUsd including text, reference inputs and output');
  return { reserveUsd: reserveUsd as number, basis: 'Caller estimate; application reservation, not provider invoice cap', revision: '2026-10-18', rates: gptImageContract(model || '')?.rates };
}
/** Estimate from reported tokens at published Standard rates; no assumed cache discount. */
export function imageUsageUsd(model: string, usage: unknown): number | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as Record<string, unknown>;
  const details = u.input_tokens_details as Record<string, unknown> | undefined;
  const values = [details?.text_tokens, details?.image_tokens, u.output_tokens];
  if (!values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return undefined;
  const rates = gptImageContract(model)?.rates;
  if (!rates) return undefined;
  return ((values[0] as number) * rates.text + (values[1] as number) * rates.image + (values[2] as number) * rates.output) / 1e6;
}
