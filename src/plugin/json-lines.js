export class JsonLineDecoder {
  #buffer = "";

  push(chunk) {
    this.#buffer += chunk;
    const lines = this.#buffer.split("\n");
    this.#buffer = lines.pop();
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
}

export function encodeLine(message) {
  return `${JSON.stringify(message)}\n`;
}
