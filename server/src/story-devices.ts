import { z } from 'zod';

const storyBrief = {
  situation: z.string().trim().min(1).max(2000).describe(
    'Summarize the actual conflict and known constraints. Example: "A manager takes credit for a junior employee’s work before a promotion meeting."',
  ),
  format: z.enum(['short', 'long']).optional().describe(
    'Use short for one compact sequence or long for a multi-scene arc. Default: short. Example: "short".',
  ),
};

const pressures = [
  'power', 'secret', 'betrayal', 'deadline', 'dilemma', 'rivalry',
  'threat', 'exposure', 'misreading', 'allegiance',
] as const;
const levels = ['restrained', 'heightened'] as const;
const goals = ['truth', 'accountability', 'restoration', 'agency', 'protection', 'reversal'] as const;

export const storyIntensitySchema = z.object({
  ...storyBrief,
  pressure: z.enum(pressures).describe(
    'Choose the principal pressure already in the story. Example: "power" for unequal authority, "misreading" for a credible wrong belief, or "allegiance" for support that shifts.',
  ),
  level: z.enum(levels).optional().describe(
    'Use restrained for a private or modest consequence, heightened for a larger consequence the premise can support. Default: restrained. Example: "heightened".',
  ),
});

type Pressure = typeof pressures[number];
type Goal = typeof goals[number];

const tension: Record<Pressure, {
  nameKo: string;
  question: string;
  setup: string;
  restrained: string;
  heightened: string;
}> = {
  power: {
    nameKo: '권력 차이와 압박',
    question: 'Can the person refuse while the other side still controls something they need?',
    setup: 'Show an ordinary request and the actual leverage that makes refusal expensive.',
    restrained: 'Make the stronger party ask for one concrete concession in private.',
    heightened: 'Have a decision-maker adopt the stronger party’s version, putting something already valuable at risk.',
  },
  secret: {
    nameKo: '비밀과 정보 격차',
    question: 'Who will act on the missing fact before it is understood?',
    setup: 'Show one clue that serves the current scene and can later be read another way.',
    restrained: 'Let one person notice a contradiction and make a small but consequential choice.',
    heightened: 'Let a believable partial truth trigger a decision that becomes hard to undo.',
  },
  betrayal: {
    nameKo: '배신과 신뢰 붕괴',
    question: 'What does the person risk by trusting the ally again?',
    setup: 'Show a promise in action and the trust or access it earns.',
    restrained: 'Reveal a choice that breaks the promise and changes what the injured person is willing to share.',
    heightened: 'Make the ally choose between loyalty and an incompatible interest while both options are still open.',
  },
  deadline: {
    nameKo: '마감과 선택지 소멸',
    question: 'What closes when the remaining time runs out?',
    setup: 'Establish an immovable deadline or a last remaining chance and show what closes when it is gone.',
    restrained: 'Take away the easiest remaining option as the deadline approaches.',
    heightened: 'Make the last feasible attempt close a second door the character wanted to keep open.',
  },
  dilemma: {
    nameKo: '양립할 수 없는 선택',
    question: 'Which of two things the person values will they sacrifice?',
    setup: 'Show why each option matters through a different relationship or obligation.',
    restrained: 'Ask for a choice that costs comfort, face, time, or trust.',
    heightened: 'Force a choice whose cost another person will feel. Let that person respond.',
  },
  rivalry: {
    nameKo: '경쟁과 평가',
    question: 'Can the underestimated person win under a standard both sides recognize?',
    setup: 'Make the shared metric or deciding audience visible and show why the rival seems favored.',
    restrained: 'Use one small contest or task to make the old ranking uncertain.',
    heightened: 'Raise the stakes of a fair test by attaching an outcome the participants already care about.',
  },
  threat: {
    nameKo: '구체적인 위험과 상실',
    question: 'Can they protect the person, livelihood or place before the loss becomes permanent?',
    setup: 'Show what ordinary life depends on and a concrete sign that it could be lost.',
    restrained: 'Make one practical safeguard fail and show the smaller fallback the principal can still use.',
    heightened: 'Let the threat cause an observable loss or force a choice between two existing priorities.',
  },
  exposure: {
    nameKo: '공개 압박과 평판 위기',
    question: 'What will the people watching do with the version they hear first?',
    setup: 'Establish whose judgment matters and why a private dispute matters to them.',
    restrained: 'Let the issue reach one trusted witness whose behavior changes.',
    heightened: 'Let a partial account reach a wider group with the power to change an established relationship or decision.',
  },
  misreading: {
    nameKo: '오해와 누명',
    question: 'What will someone do because the wrong explanation looks convincing?',
    setup: 'Give the affected person a fair reason to believe the wrong account and leave an observable clue that could change it.',
    restrained: 'Let someone withdraw an invitation, withhold help or make another small choice on the wrong premise.',
    heightened: 'Let a person with authority act on the mistake, so disproving it has a cost beyond speaking up.',
  },
  allegiance: {
    nameKo: '동맹 이동과 고립',
    question: 'Whose support can the principal still count on when the interests diverge?',
    setup: 'Show who is counted on and the obligation or shared interest sustaining that support.',
    restrained: 'Have one expected supporter stay silent or act independently for a reason the audience can see.',
    heightened: 'Let a change of side close an existing option and force the principal to commit to a different one.',
  },
};

const catharsisPatterns = [
  {
    id: 'official-correction', nameKo: '공식 시정', goals: ['accountability', 'protection'],
    setup: 'Establish who can reverse the decision and the rule that gives them that authority.',
    turn: 'Bring the disputed fact or testimony to that decision-maker.',
    payoff: 'Show the ruling, reversal or formal protection taking effect.',
    avoid: 'A finding without an actual change in the decision.',
  },
  {
    id: 'exit', nameKo: '관계 이탈', goals: ['agency', 'protection'],
    setup: 'Show the recurring demand and what leaving would cost.',
    turn: 'The person chooses to end their participation and takes a concrete step.',
    payoff: 'Show what their next day or encounter looks like outside the relationship.',
    avoid: 'Threatening to leave without a choice that changes their situation.',
  },
  {
    id: 'ally-intervention', nameKo: '동맹 개입', goals: ['protection', 'reversal'],
    setup: 'Establish why the ally cares and which resource or influence they control.',
    turn: 'The ally commits that resource at a moment when the principal cannot reach it alone.',
    payoff: 'Show the exact option the intervention opens and what the principal does with it.',
    avoid: 'An unprepared rescuer who removes the principal’s choice.',
  },
  {
    id: 'restoration', nameKo: '피해 회복', goals: ['restoration', 'protection'],
    setup: 'Make the lost money, access, safety or opportunity specific.',
    turn: 'The principal or an ally secures a way to get the missing thing back.',
    payoff: 'Show the return in use, receipt or an observable change in daily life.',
    avoid: 'Treating an apology as restitution when the loss remains.',
  },
  {
    id: 'boundary', nameKo: '경계 설정', goals: ['agency', 'protection'],
    setup: 'Show a recurring obligation the other party regards as automatic.',
    turn: 'The principal declines the specific demand and acts consistently with that decision.',
    payoff: 'Show who handles the next instance and what the principal is free to do.',
    avoid: 'A sharp comeback followed by the same unpaid burden.',
  },
  {
    id: 'record-reveal', nameKo: '기록 공개', goals: ['truth', 'accountability'],
    setup: 'Plant a credible record before the dispute and establish who can read it.',
    turn: 'Put that record in front of the person whose judgment changes the outcome.',
    payoff: 'Show that person revise a claim, decision or allocation of responsibility.',
    avoid: 'A record that appears for the first time with no plausible origin.',
  },
  {
    id: 'speaking-out', nameKo: '공개 발언', goals: ['truth', 'agency'],
    setup: 'Establish whose account dominates and why the person with contrary knowledge stays quiet.',
    turn: 'That person speaks to the people who have been acting on the wrong account.',
    payoff: 'Show a listener act on the changed understanding.',
    avoid: 'A speech followed only by generic applause.',
  },
  {
    id: 'demonstrated-skill', nameKo: '실력 입증', goals: ['reversal', 'restoration'],
    setup: 'Show the existing judgment and establish the test the doubters accept.',
    turn: 'Let the underestimated person pass that test through an ability the story has shown.',
    payoff: 'Show the measurable result and the opportunity or recognition it opens.',
    avoid: 'Praise in place of the actual test or result.',
  },
  {
    id: 'rule-backfire', nameKo: '자기모순', goals: ['reversal', 'accountability'],
    setup: 'Let the person in charge state the exact rule and show who normally absorbs its cost.',
    turn: 'Apply the rule as stated in a situation the rule-maker depends on.',
    payoff: 'Show the consequence reach the rule-maker and a decision they can no longer avoid.',
    avoid: 'A consequence unrelated to the rule that was established.',
  },
  {
    id: 'acknowledgment', nameKo: '책임 인정', goals: ['accountability', 'restoration'],
    setup: 'Specify the harm or overlooked contribution and who keeps denying it.',
    turn: 'That person publicly or privately acknowledges the specific act or contribution.',
    payoff: 'Show what the acknowledgment changes for the affected person, including their right to decline reconciliation.',
    avoid: 'A vague apology that grants automatic forgiveness.',
  },
  {
    id: 'identity-reveal', nameKo: '정체 공개', goals: ['truth', 'reversal'],
    setup: 'Show a plausible mistaken assumption and plant a clue to the actual role or identity.',
    turn: 'Reveal the identity where the old assumption was guiding a consequential decision.',
    payoff: 'Show the decision or behavior change because of the reveal.',
    avoid: 'Using wealth or rank by itself as proof the person deserved respect.',
  },
  {
    id: 'trap-reversal', nameKo: '함정 역전', goals: ['reversal', 'accountability'],
    setup: 'Show the opponent’s calculation and a believable weakness in its assumptions.',
    turn: 'The principal changes the conditions the opponent relied on.',
    payoff: 'The opponent makes a motivated choice and ends up bearing the cost they expected to shift.',
    avoid: 'An omniscient principal who predicts choices the story never motivated.',
  },
  {
    id: 'direct-intervention', nameKo: '직접 응징·저지', goals: ['protection', 'accountability'],
    setup: 'Show an ongoing harmful act and why the principal can intervene now.',
    turn: 'The principal directly interrupts the act or removes the source of leverage.',
    payoff: 'Show that the targeted harm stops and what the affected person can do next.',
    avoid: 'Escalating the spectacle past the conflict or carrying a fictional tactic into real life.',
  },
  {
    id: 'mirrored-consequence', nameKo: '되돌려주기', goals: ['reversal', 'accountability'],
    setup: 'Show exactly who bears the recurring inconvenience and who dismisses it.',
    turn: 'The person who dismissed the cost experiences an equivalent consequence.',
    payoff: 'Show their reaction or the change in who is expected to absorb the cost.',
    avoid: 'An unrelated or disproportionate punishment.',
  },
  {
    id: 'preemption', nameKo: '선수 치기', goals: ['protection', 'reversal'],
    setup: 'Establish what the character can reasonably know before the adverse decision.',
    turn: 'They use that knowledge to change a concrete condition while the option is open.',
    payoff: 'Show what they secured or what predicted loss they prevented.',
    avoid: 'Foresight without a prior source or a meaningful choice.',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  nameKo: string;
  goals: readonly Goal[];
  setup: string;
  turn: string;
  payoff: string;
  avoid: string;
}>;

type PatternId = typeof catharsisPatterns[number]['id'];
const [firstPattern, ...otherPatterns] = catharsisPatterns;
const patternIds: [PatternId, ...PatternId[]] = [firstPattern.id, ...otherPatterns.map(({ id }) => id)];

export const storyCatharsisSchema = z.object({
  ...storyBrief,
  goal: z.enum(goals).optional().describe(
    'Filter by the outcome the audience is owed: a revealed truth, accountability, restoration, agency, protection, or reversal. Example: "agency". Omit to compare all 15.',
  ),
  pattern: z.enum(patternIds).optional().describe(
    'Choose a specific mechanism, overriding the goal filter. Example: "record-reveal".',
  ),
});

/** Plan an escalation around the pressure already present in the brief. */
export function planStoryIntensity(input: z.infer<typeof storyIntensitySchema>) {
  const { situation, pressure, format = 'short', level = 'restrained' } = input;
  const device = tension[pressure];
  return {
    situation, pressure, nameKo: device.nameKo, format, level,
    audienceQuestion: device.question,
    beats: {
      setup: device.setup,
      escalation: device[level],
      choice: 'Give the principal an observable choice between two plausible options with different costs.',
      consequence: 'Show which option closes and who must respond. Let the response change the next action.',
    },
    pacing: format === 'short'
      ? 'Use one pressure change between the opening and the consequential choice.'
      : 'Use successive changes in options, knowledge or alliances. Resolve intermediate questions before escalating again.',
    fitCheck: 'Keep the pressure only if it changes a later choice the story already needs. Scale it to the requested tone and established facts.',
  };
}

/** Return researched payoff mechanisms the author can adapt to the brief. */
export function planStoryCatharsis(input: z.infer<typeof storyCatharsisSchema>) {
  const { situation, format = 'short', goal, pattern } = input;
  const candidates = catharsisPatterns.filter((candidate) => {
    if (pattern) return candidate.id === pattern;
    return !goal || candidate.goals.some((tag) => tag === goal);
  });
  return {
    situation, format,
    candidates,
    pacing: format === 'short'
      ? 'Set up one decisive change and make room for the affected person’s immediate response.'
      : 'Resolve smaller obstacles as the arc progresses, then show what the central decision changes beyond the reveal.',
    fitCheck: 'Choose what directly resolves the audience’s question with the people, evidence and authority already available.',
  };
}
