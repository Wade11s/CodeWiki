export class CodeWikiError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = "CodeWikiError";
  }
}
