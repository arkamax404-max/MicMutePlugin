#include <windows.h>
#include <audioclient.h>
#include <endpointvolume.h>
#include <propsys.h>
#include <functiondiscoverykeys_devpkey.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <wrl/client.h>

#include <atomic>
#include <cctype>
#include <cwchar>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace {
std::mutex output_mutex;

std::string utf8(const wchar_t* value) {
  if (!value) return {};
  const int length = static_cast<int>(wcslen(value));
  const int size = WideCharToMultiByte(CP_UTF8, 0, value, length, nullptr, 0, nullptr, nullptr);
  std::string result(size > 0 ? static_cast<size_t>(size) : 0, '\0');
  if (size > 0) WideCharToMultiByte(CP_UTF8, 0, value, length, result.data(), size, nullptr, nullptr);
  return result;
}

std::wstring wide(const std::string& value) {
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) return {};
  std::wstring result(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size);
  return result;
}

std::string json_escape(const std::string& value) {
  std::ostringstream out;
  for (const unsigned char character : value) {
    switch (character) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\b': out << "\\b"; break;
      case '\f': out << "\\f"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (character < 0x20) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(character);
        else out << character;
    }
  }
  return out.str();
}

void send_line(const std::string& line) {
  std::scoped_lock lock(output_mutex);
  std::cout << line << '\n' << std::flush;
}

std::optional<std::string> json_string(const std::string& json, const std::string& wanted_key, size_t occurrence = 1) {
  size_t position = 0;
  size_t matches = 0;
  auto parse_string = [&](size_t& cursor) -> std::optional<std::string> {
    if (cursor >= json.size() || json[cursor++] != '"') return std::nullopt;
    std::string value;
    while (cursor < json.size()) {
      const char character = json[cursor++];
      if (character == '"') return value;
      if (character != '\\') { value += character; continue; }
      if (cursor >= json.size()) return std::nullopt;
      const char escaped = json[cursor++];
      switch (escaped) {
        case '"': case '\\': case '/': value += escaped; break;
        case 'b': value += '\b'; break;
        case 'f': value += '\f'; break;
        case 'n': value += '\n'; break;
        case 'r': value += '\r'; break;
        case 't': value += '\t'; break;
        default: return std::nullopt;
      }
    }
    return std::nullopt;
  };
  while (position < json.size()) {
    if (json[position] != '"') { ++position; continue; }
    auto token = parse_string(position);
    if (!token) return std::nullopt;
    size_t cursor = position;
    while (cursor < json.size() && isspace(static_cast<unsigned char>(json[cursor]))) ++cursor;
    if (*token != wanted_key || cursor >= json.size() || json[cursor] != ':') continue;
    if (++matches != occurrence) continue;
    ++cursor;
    while (cursor < json.size() && isspace(static_cast<unsigned char>(json[cursor]))) ++cursor;
    return parse_string(cursor);
  }
  return std::nullopt;
}

std::string hresult_code(HRESULT result) {
  std::ostringstream out;
  out << "HRESULT_0x" << std::hex << std::uppercase << static_cast<unsigned long>(result);
  return out.str();
}

std::string error_response(const std::string& id, const std::string& code, const std::string& message) {
  return "{\"id\":\"" + json_escape(id) + "\",\"ok\":false,\"error\":{\"code\":\"" +
    json_escape(code) + "\",\"message\":\"" + json_escape(message) + "\"}}";
}

ERole parse_role(const std::string& role) {
  if (role == "multimedia") return eMultimedia;
  if (role == "communications") return eCommunications;
  return eConsole;
}

class NotificationClient final : public IMMNotificationClient {
 public:
  ULONG STDMETHODCALLTYPE AddRef() override { return ++references_; }
  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG references = --references_;
    if (!references) delete this;
    return references;
  }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** object) override {
    if (!object) return E_POINTER;
    if (iid == __uuidof(IUnknown) || iid == __uuidof(IMMNotificationClient)) {
      *object = static_cast<IMMNotificationClient*>(this);
      AddRef();
      return S_OK;
    }
    *object = nullptr;
    return E_NOINTERFACE;
  }
  HRESULT STDMETHODCALLTYPE OnDeviceStateChanged(LPCWSTR, DWORD) override { notify(); return S_OK; }
  HRESULT STDMETHODCALLTYPE OnDeviceAdded(LPCWSTR) override { notify(); return S_OK; }
  HRESULT STDMETHODCALLTYPE OnDeviceRemoved(LPCWSTR) override { notify(); return S_OK; }
  HRESULT STDMETHODCALLTYPE OnDefaultDeviceChanged(EDataFlow flow, ERole, LPCWSTR) override {
    if (flow == eCapture) notify();
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnPropertyValueChanged(LPCWSTR, const PROPERTYKEY) override { notify(); return S_OK; }

 private:
  void notify() { send_line("{\"event\":\"topologyChanged\"}"); }
  std::atomic<ULONG> references_{1};
};

class AudioService {
 public:
  HRESULT initialize() {
    HRESULT result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator_));
    if (FAILED(result)) return result;
    notifications_ = new NotificationClient();
    result = enumerator_->RegisterEndpointNotificationCallback(notifications_);
    if (FAILED(result)) { notifications_->Release(); notifications_ = nullptr; }
    return result;
  }

  ~AudioService() {
    if (enumerator_ && notifications_) enumerator_->UnregisterEndpointNotificationCallback(notifications_);
    if (notifications_) notifications_->Release();
  }

  std::string list(const std::string& id) {
    ComPtr<IMMDeviceCollection> collection;
    HRESULT result = enumerator_->EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE, &collection);
    if (FAILED(result)) return error_response(id, hresult_code(result), "Could not enumerate capture devices");
    UINT count = 0;
    collection->GetCount(&count);
    std::ostringstream devices;
    devices << "{\"id\":\"" << json_escape(id) << "\",\"ok\":true,\"result\":{\"devices\":[";
    bool first = true;
    for (UINT index = 0; index < count; ++index) {
      ComPtr<IMMDevice> device;
      if (FAILED(collection->Item(index, &device))) continue;
      LPWSTR endpoint_id = nullptr;
      if (FAILED(device->GetId(&endpoint_id))) continue;
      const std::string name = friendly_name(device.Get());
      if (!first) devices << ',';
      first = false;
      devices << "{\"id\":\"" << json_escape(utf8(endpoint_id)) << "\",\"name\":\"" << json_escape(name) << "\"}";
      CoTaskMemFree(endpoint_id);
    }
    devices << "]}}";
    return devices.str();
  }

  std::string status(const std::string& request_id, const std::string& mode, const std::string& endpoint_id,
                     const std::string& role, bool toggle) {
    ComPtr<IMMDevice> device;
    HRESULT result;
    if (mode == "specific") {
      if (endpoint_id.empty()) return available_response(request_id, false, nullptr, false);
      const std::wstring endpoint = wide(endpoint_id);
      result = enumerator_->GetDevice(endpoint.c_str(), &device);
      if (result == E_NOTFOUND || result == HRESULT_FROM_WIN32(ERROR_NOT_FOUND)) return available_response(request_id, false, nullptr, false);
      if (FAILED(result)) return error_response(request_id, hresult_code(result), "Could not resolve the fixed capture device");
      DWORD state = 0;
      if (FAILED(device->GetState(&state)) || !(state & DEVICE_STATE_ACTIVE)) return available_response(request_id, false, nullptr, false);
    } else {
      result = enumerator_->GetDefaultAudioEndpoint(eCapture, parse_role(role), &device);
      if (result == E_NOTFOUND) return available_response(request_id, false, nullptr, false);
      if (FAILED(result)) return error_response(request_id, hresult_code(result), "Could not resolve the default capture device");
    }

    ComPtr<IAudioEndpointVolume> volume;
    result = device->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, &volume);
    if (FAILED(result)) return error_response(request_id, hresult_code(result), "Could not open capture endpoint volume");
    BOOL muted = FALSE;
    result = volume->GetMute(&muted);
    if (FAILED(result)) return error_response(request_id, hresult_code(result), "Could not read capture mute state");
    if (toggle) {
      result = volume->SetMute(!muted, nullptr);
      if (FAILED(result)) return error_response(request_id, hresult_code(result), "Could not change capture mute state");
      result = volume->GetMute(&muted);
      if (FAILED(result)) return error_response(request_id, hresult_code(result), "Mute changed but state verification failed");
    }
    return available_response(request_id, true, device.Get(), muted != FALSE);
  }

 private:
  static std::string friendly_name(IMMDevice* device) {
    ComPtr<IPropertyStore> properties;
    if (FAILED(device->OpenPropertyStore(STGM_READ, &properties))) return "Unknown capture device";
    PROPVARIANT value;
    PropVariantInit(&value);
    const HRESULT result = properties->GetValue(PKEY_Device_FriendlyName, &value);
    const std::string name = SUCCEEDED(result) && value.vt == VT_LPWSTR ? utf8(value.pwszVal) : "Unknown capture device";
    PropVariantClear(&value);
    return name;
  }

  static std::string available_response(const std::string& id, bool available, IMMDevice* device, bool muted) {
    std::ostringstream out;
    out << "{\"id\":\"" << json_escape(id) << "\",\"ok\":true,\"result\":{\"available\":" << (available ? "true" : "false");
    if (available && device) {
      LPWSTR endpoint_id = nullptr;
      device->GetId(&endpoint_id);
      out << ",\"id\":\"" << json_escape(utf8(endpoint_id)) << "\",\"name\":\"" << json_escape(friendly_name(device))
          << "\",\"muted\":" << (muted ? "true" : "false");
      CoTaskMemFree(endpoint_id);
    }
    out << "}}";
    return out.str();
  }

  ComPtr<IMMDeviceEnumerator> enumerator_;
  NotificationClient* notifications_ = nullptr;
};
}  // namespace

int main() {
  SetConsoleOutputCP(CP_UTF8);
  const HRESULT com_result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(com_result)) {
    send_line(error_response("", hresult_code(com_result), "COM initialization failed"));
    return 2;
  }

  int exit_code = 0;
  {
    AudioService audio;
    const HRESULT init_result = audio.initialize();
    if (FAILED(init_result)) {
      send_line(error_response("", hresult_code(init_result), "Core Audio initialization failed"));
      exit_code = 3;
    } else {
      std::string line;
      while (std::getline(std::cin, line)) {
        const std::string id = json_string(line, "id").value_or("");
        const std::string command = json_string(line, "command").value_or("");
        if (command == "shutdown") break;
        if (command == "list") { send_line(audio.list(id)); continue; }
        if (command == "status" || command == "toggle") {
          send_line(audio.status(id, json_string(line, "mode").value_or("default"), json_string(line, "id", 2).value_or(""),
                                 json_string(line, "role").value_or("console"), command == "toggle"));
          continue;
        }
        send_line(error_response(id, "INVALID_COMMAND", "Expected list, status, toggle, or shutdown"));
      }
    }
  }

  CoUninitialize();
  return exit_code;
}
