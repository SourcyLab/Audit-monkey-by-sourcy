import { defaultAISettings, provider } from "./ai";
const settings = defaultAISettings();
export const currentAISettings = () => ({ ...settings });
export function mountAI(root: HTMLElement) {
  const slot = root.querySelector("#ai-settings");
  if (!slot) return;
  slot.innerHTML =
    '<section class="card"><h2>Optional AI · your own key</h2><p>All audit tools work without AI. Settings and keys stay in session memory only and are never saved in case JSON. Enabling AI permits requests only after an explicit Send or Draft audit review action. Draft audit review may also send applicable approved tenant corrections after your sharing confirmation. That sends the selected content to your configured provider, which may retain it and charge your account. Never paste secrets or unapproved personal records. Browser extensions and other scripts on this device may access session keys.</p><label class="check"><input id="ai-enabled" type="checkbox">Enable optional AI for this session</label><div class="fields"><label class="field">Provider<select id="ai-provider"><option value="openai-compatible">OpenAI-compatible</option><option value="anthropic">Anthropic</option></select></label><label class="field">Full API endpoint<input id="ai-endpoint" type="url"></label><label class="field">Model ID (from your provider)<input id="ai-model"></label><label class="field">Your API key · session only<input id="ai-key" type="password" autocomplete="off"></label></div><label class="field">Selected text to send · redact before use<textarea id="ai-text" maxlength="100000"></textarea></label><button id="ai-send" class="btn">Send selected text</button> <button id="ai-clear" class="btn">Clear key and disable AI</button><p id="ai-status" role="status"></p><pre id="ai-result" role="region" tabindex="0" aria-label="Unverified AI draft"></pre></section>';
  const input = (id: string) =>
    root.querySelector<HTMLInputElement>("#ai-" + id)!;
  input("enabled").checked = settings.enabled;
  input("endpoint").value = settings.endpoint;
  input("model").value = settings.model;
  input("key").value = settings.key;
  input("provider").value = settings.provider;
  input("enabled").onchange = () => {
    settings.enabled = input("enabled").checked;
  };
  input("endpoint").onchange = () => {
    settings.endpoint = input("endpoint").value;
  };
  input("key").onchange = () => {
    settings.key = input("key").value;
  };
  input("model").onchange = () => {
    settings.model = input("model").value;
  };
  input("provider").onchange = () => {
    settings.provider = input("provider").value as typeof settings.provider;
    settings.endpoint =
      settings.provider === "anthropic"
        ? "https://api.anthropic.com/v1/messages"
        : "https://api.openai.com/v1/chat/completions";
    input("endpoint").value = settings.endpoint;
  };
  root.querySelector<HTMLButtonElement>("#ai-clear")!.onclick = () => {
    Object.assign(settings, defaultAISettings());
    mountAI(root);
  };
  root.querySelector<HTMLButtonElement>("#ai-send")!.onclick = async () => {
    const button = root.querySelector<HTMLButtonElement>("#ai-send")!,
      status = root.querySelector("#ai-status")!,
      result = root.querySelector("#ai-result")!;
    button.disabled = true;
    status.textContent = "";
    result.textContent = "";
    try {
      result.textContent = await provider.summarize(
        input("text").value,
        settings,
      );
      status.textContent =
        "Unverified AI draft. Check against records and applicable sources.";
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : "AI request failed. Local tools remain available.";
    } finally {
      button.disabled = false;
    }
  };
}
