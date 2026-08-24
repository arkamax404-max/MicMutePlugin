import EventEmitter from "node:events";
import WebSocket from "ws";

export class HostClient extends EventEmitter {
  connect(uuid, port = 3906, address = "127.0.0.1") {
    const [hostAddress, hostPort] = process.argv.slice(2);
    this.uuid = uuid;
    this.socket = new WebSocket(`ws://${hostAddress || address}:${hostPort || port}`);
    this.socket.on("open", () => {
      this.socket.send(JSON.stringify({ code: 0, cmd: "connected", uuid }));
      this.emit("connected", {});
    });
    this.socket.on("error", (error) => this.emit("error", error));
    this.socket.on("close", () => this.emit("close"));
    this.socket.on("message", (raw) => this.#receive(raw));
  }

  #receive(raw) {
    const data = JSON.parse(raw.toString());
    if (!data || (data.code !== undefined && data.cmdType !== "REQUEST")) return;
    this.send(data.cmd, { code: 0, ...data });
    if (data.cmd === "clear" && Array.isArray(data.param)) {
      for (const item of data.param) item.context = this.encodeContext(item);
    } else {
      data.context = this.encodeContext(data);
    }
    this.emit(data.cmd, data);
  }

  encodeContext(message) {
    return `${message.uuid}___${message.key}___${message.actionid}`;
  }

  decodeContext(context) {
    const [uuid, key, actionid] = context.split("___");
    return { uuid, key, actionid };
  }

  send(cmd, parameters) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ cmd, uuid: this.uuid, ...parameters }));
  }

  onAdd(handler) { return this.on("add", handler); }
  onRun(handler) { return this.on("run", handler); }
  onClear(handler) { return this.on("clear", handler); }
  onSetActive(handler) { return this.on("setactive", handler); }
  onParamFromApp(handler) { return this.on("paramfromapp", handler); }
  onParamFromPlugin(handler) { return this.on("paramfromplugin", handler); }
  onSendToPlugin(handler) { return this.on("sendToPlugin", handler); }

  setStateIcon(context, state, text = "") {
    const identity = this.decodeContext(context);
    this.send("state", { param: { statelist: [{ ...identity, type: 0, state, textData: text, showtext: Boolean(text) }] } });
  }

  showAlert(context) {
    this.send("showAlert", this.decodeContext(context));
  }

  sendToPropertyInspector(payload, context) {
    this.send("sendToPropertyInspector", { ...this.decodeContext(context), payload });
  }

  logMessage(message, level = "info") {
    this.send("logMessage", { message, level });
  }
}
