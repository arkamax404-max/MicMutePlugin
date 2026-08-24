# Ulanzi D200 Microphone Mute

This Windows x64 plugin toggles mute for either a role-specific Windows default capture device or one fixed capture endpoint. It follows the Node main-service and HTML Property Inspector APIs in the official Ulanzi SDK pinned at commit `550ab80c69285ecf259bd494a7fff767c14f0c0f`.

## Build And Verify

Prerequisites: Node.js 20.12.2, CMake 3.20+, and Visual Studio 2022 Build Tools with the Desktop development with C++ workload.

```powershell
npm ci
npm run check
npm test
npm run build
npm run test:native
npm run package
```

The final asset is `release/com.ulanzi.arkamax404micmute.ulanziPlugin.zip`. The ZIP contains the identically named `.ulanziPlugin` directory as its root, as required by the Ulanzi Community Store.

## Install And Use

1. Build the project.
2. Install or copy `com.ulanzi.arkamax404micmute.ulanziPlugin` using the plugin workflow supported by UlanziStudio.
3. Add **Toggle Microphone** to a D200 keypad button.
4. Choose **Follow a Windows default** and an explicit Console, Multimedia, or Communications role, or choose **Use one fixed device**.
5. Press the button. Red means muted, green means live, and gray means unavailable.

A fixed device never falls back to another microphone. If Windows removes or disables it, the action remains unavailable until that exact opaque endpoint ID is available again or settings are changed.

## Architecture

| Component | Responsibility |
| --- | --- |
| `dist/plugin.cjs` | Bundled Node main service using verified Ulanzi host events and one process manager for all action contexts. |
| Property Inspector | Persists target mode, default role, and opaque fixed endpoint ID; requests live capture-device lists through the host. |
| `native/micmute-helper.exe` | C++20 Windows x64 JSON Lines service using `IMMDeviceEnumerator` and `IAudioEndpointVolume`. |
| JSON Lines protocol | Supports `list`, `status`, `toggle`, and `shutdown`; responses carry request IDs and structured errors. |

The native helper registers `IMMNotificationClient`, so endpoint additions, removals, state changes, property changes, and role-specific default changes trigger immediate refreshes. Ulanzi has no host audio API.

## Protocol

Requests are one JSON object per line:

```json
{"id":"1","command":"status","target":{"mode":"default","role":"communications"}}
{"id":"2","command":"toggle","target":{"mode":"specific","id":"opaque Windows endpoint ID"}}
```

Successful responses use `{ "id", "ok": true, "result" }`. Failures use `{ "id", "ok": false, "error": { "code", "message" } }`. Unsolicited topology notifications use `{ "event": "topologyChanged" }`.

## Packaging And Publication

`npm run package` refuses to package before the Node bundle, x64 helper, and third-party notices exist. Tagged GitHub builds create and attach exactly `com.ulanzi.arkamax404micmute.ulanziPlugin.zip`; manual workflow runs only create a downloadable artifact.

The manifest author is `Santiago Pérez`. The stable SDK-compatible plugin UUID is `com.ulanzi.ulanzistudio.arkamax404micmute`, with action UUIDs extending it. The package includes `THIRD_PARTY_NOTICES.md`, which preserves the MIT notice for the bundled `ws` dependency. This repository does not declare a project license.

Before publishing:

1. Test the built package against current UlanziStudio and a physical D200.
2. Confirm the manifest version and release notes.
3. Create a version tag only after those checks pass.

Publication target: <https://ulanzicommunitystore.narlei.com/#publish>.

## Bounded Limitations

- Windows 10/11 x64 and D200 Keypad are the only declared targets.
- External endpoint mute changes are observed by a two-second poll while at least one action context exists. Core Audio topology/default changes are callback-driven, but endpoint-volume callbacks are not registered in this MVP.
- The helper reports active capture endpoints. Disabled, unplugged, and not-present fixed endpoints appear unavailable.
- Device names may change; identity always uses the opaque endpoint ID.
- The Ulanzi simulator can verify host messaging but cannot replace physical D200 and Windows audio-device testing.
- No release is published by this repository workflow unless a maintainer deliberately pushes a tag.

## Project Layout

```text
com.ulanzi.arkamax404micmute.ulanziPlugin/     publishable plugin root
native/                                       Windows Core Audio helper source
src/plugin/                                   Node service and pure state/protocol logic
test/                                         Node behavior tests
scripts/                                      validation and ZIP packaging
.github/workflows/release.yml                 Windows x64 release build
```
