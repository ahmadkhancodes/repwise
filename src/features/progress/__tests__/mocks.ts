/** Module doubles shared by the progress screen tests (imported for side effects in jest.mock). */
export const fileSystemMock = () => {
  const files = new Set<string>();
  const join = (...parts: (string | { uri: string })[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : p.uri))
      .join('/')
      .replace(/([^:])\/{2,}/g, '$1/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(...parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    async copy(dest: File) {
      files.add(dest.uri);
    }
    create() {
      files.add(this.uri);
    }
    write() {}
    delete() {
      files.delete(this.uri);
    }
  }
  class Directory extends File {
    override create() {
      files.add(this.uri);
    }
  }
  return {
    File,
    Directory,
    Paths: { document: { uri: 'file:///docs' }, cache: { uri: 'file:///cache' } },
    __files: files,
  };
};
