function present(input: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.hasOwn(input, field) ? { [field]: input[field] } : {};
}

export function mapTaskProfessionalReadRequest(_input: Record<string, unknown> = {}): Readonly<Record<string, never>> {
  return Object.freeze({});
}

export function mapTaskRetrospectiveRequest(input: Record<string, unknown> = {}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...present(input, 'status'),
    ...present(input, 'note'),
    expectedCurrentDigest: input.expectedCurrentDigest,
  });
}
