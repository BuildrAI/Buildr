type Feedback = {
  start(): void;
  ready(prompt: string): void;
  failed(error: unknown): void;
  settled(): void;
};

/** Only the latest request for unchanged inputs may publish a result or feedback. */
export function createPromptRequest() {
  let revision = 0;
  const invalidate = () => { revision += 1; };
  const observe = () => {
    const observed = revision;
    return () => observed === revision;
  };
  const run = async (prepare: () => string | Promise<string>, feedback: Feedback) => {
    invalidate();
    const current = observe();
    feedback.start();
    try {
      const prompt = await prepare();
      if (current()) feedback.ready(prompt);
    } catch (error) {
      if (current()) feedback.failed(error);
    } finally {
      if (current()) feedback.settled();
    }
  };
  return { invalidate, observe, run };
}
