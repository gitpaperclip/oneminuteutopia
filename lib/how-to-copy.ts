/** How-to / info overlay copy. Jake's lean resident sheet — no portal lecture. */
export const HOW_TO_COPY = {
  title: 'One Minute Utopia',
  openLabel: 'How to use',
  closeLabel: 'Close',
  doneLabel: 'Got it',
  steps: [
    'Snap a photo',
    'Review your submission',
    'Save your report and get quick access to relevant agency contact information',
  ],
  emergency: 'If the situation is dangerous, get to safety and contact 911.',
  privacyLead: 'Your location is recorded with your report. Do not upload or share ',
  privacyEmphasis: 'any',
  privacyTail: ' potentially compromising information.',
} as const;

export const HOW_TO_PRIVACY = `${HOW_TO_COPY.privacyLead}${HOW_TO_COPY.privacyEmphasis}${HOW_TO_COPY.privacyTail}`;
