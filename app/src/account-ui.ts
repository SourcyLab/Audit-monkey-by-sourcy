import { tenantHeaders } from "./tenant-ui";
import { TERMS_TEXT, TERMS_VERSION } from "./terms";
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...tenantHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Account request failed");
  return value;
}
export async function accountGate(root: HTMLElement): Promise<string> {
  try {
    const state = await api("session");
    if (state.registered) return state.userId;
  } catch {
    /* show form; server errors stay explicit on submission */
  }
  return new Promise((resolve) => {
    root.innerHTML =
      '<main class="content"><section class="card"><img src="/brand/audit-monkey-wordmark-light.svg" width="240" alt="The Audit Monkey"><h1>Sign up or log in</h1><p>Sourcy Inc requires your email, phone and agreement to the current terms. Sign-in uses an email code; local development displays it instead of sending email. Phone ownership is not verified. Training and third-party training-sale permissions are separate choices, off by default.</p><form id="account-form"><div class="fields"><label class="field">Email<input id="account-email" type="email" autocomplete="email" required maxlength="254"></label><label class="field">Phone<input id="account-phone" type="tel" autocomplete="tel" required maxlength="40"></label></div><details><summary>Read Terms and data-use notice · Sourcy Inc</summary><pre id="account-terms" tabindex="0"></pre></details><label class="check"><input id="account-terms-accepted" type="checkbox" required>I agree to the Terms and data-use notice.</label><label class="check"><input id="account-training" type="checkbox">Optional: I authorize Sourcy Inc to use eligible uploaded data for AI training.</label><label class="check"><input id="account-sale" type="checkbox">Optional: I authorize Sourcy Inc to sell or license eligible uploaded data to third parties for AI training.</label><p>Do not provide other people’s personal information without authority. Declining either optional use does not block audit tools. Privacy, withdrawal and deletion: Team@sourcyinc.com.</p><button class="btn primary" type="submit">Send sign-in code</button></form><form id="account-verify" hidden><label class="field">Eight-digit email code<input id="account-code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{8}"></label><button class="btn primary" type="submit">Verify and open workspace</button></form><p id="account-status" role="status"></p></section></main>';
    root.querySelector("#account-terms")!.textContent = TERMS_TEXT;
    let challengeId = "";
    const input = (id: string) =>
      root.querySelector<HTMLInputElement>("#account-" + id)!;
    const status = root.querySelector("#account-status")!;
    root.querySelector<HTMLFormElement>("#account-form")!.onsubmit = async (
      event,
    ) => {
      event.preventDefault();
      const button = root.querySelector<HTMLButtonElement>(
        "#account-form button",
      )!;
      button.disabled = true;
      try {
        const result = await api("auth/start", "POST", {
          email: input("email").value,
          phone: input("phone").value,
          termsAccepted: input("terms-accepted").checked,
          termsVersion: TERMS_VERSION,
          aiTrainingConsent: input("training").checked,
          thirdPartyTrainingSaleConsent: input("sale").checked,
        });
        challengeId = result.challengeId;
        root.querySelector<HTMLElement>("#account-verify")!.hidden = false;
        status.textContent = result.developmentCode
          ? "LOCAL DEVELOPMENT ONLY — code: " + result.developmentCode
          : result.message;
        input("code").focus();
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : "Could not request code";
      } finally {
        button.disabled = false;
      }
    };
    root.querySelector<HTMLFormElement>("#account-verify")!.onsubmit = async (
      event,
    ) => {
      event.preventDefault();
      try {
        const verified = await api("auth/verify", "POST", {
          challengeId,
          code: input("code").value,
        });
        const next = new URL(window.location.href).searchParams.get(
          "return_to",
        );
        if (next?.startsWith("/authorize?")) {
          window.location.assign(next);
          return;
        }
        resolve(verified.userId);
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : "Could not verify code";
      }
    };
  });
}
export function mountAccount(root: HTMLElement) {
  const slot = root.querySelector("#account-controls");
  if (!slot) return;
  slot.innerHTML =
    '<section class="card"><h2>Account privacy & private uploads</h2><p>Local checklist file indexing does not upload originals. Use this explicit upload control to send records to Sourcy Inc. Private uploads are limited to 25 MB each and count toward the selected tenant’s storage allowance; redact unnecessary personal information first.</p><label class="check"><input id="privacy-training" type="checkbox">Allow future AI training of eligible uploaded data</label><label class="check"><input id="privacy-sale" type="checkbox">Allow future sale/licensing of eligible data to third parties for AI training</label><button id="privacy-save" class="btn">Save consent choices</button><label class="field">File to upload to Sourcy Inc<input id="private-file" type="file"></label><label class="check"><input id="upload-authority" type="checkbox">I have authority and any necessary permission from people described in this file, and have redacted unnecessary sensitive information.</label><button id="private-upload" class="btn">Upload selected file to Sourcy Inc</button><ul id="private-files"></ul><button class="btn" id="more-private-files" hidden>More documents</button><button id="account-logout" class="btn">Log out on all sessions</button> <button id="account-delete" class="btn danger">Delete personal account</button><p id="privacy-status" role="status"></p></section>';
  const status = root.querySelector("#privacy-status")!;
  const report = (error: unknown) => {
    status.textContent =
      error instanceof Error ? error.message : "Request failed";
  };
  let fileCursor: string | null = null;
  const load = async (append = false) => {
    const state = await api("session");
    root.querySelector<HTMLInputElement>("#privacy-training")!.checked =
      Boolean(state.consents?.training);
    root.querySelector<HTMLInputElement>("#privacy-sale")!.checked = Boolean(
      state.consents?.sale,
    );
    const files: { id: string; filename: string; size: number }[] = await api(
      "uploads" +
        (append && fileCursor
          ? "?after=" + encodeURIComponent(fileCursor)
          : ""),
    );
    const list = root.querySelector("#private-files")!;
    if (!append) list.replaceChildren();
    fileCursor = files.length === 100 ? files.at(-1)!.id : null;
    root.querySelector<HTMLButtonElement>("#more-private-files")!.hidden =
      !fileCursor;
    for (const file of files) {
      const li = document.createElement("li");
      li.textContent = file.filename + " (" + file.size + " bytes) ";
      const button = document.createElement("button");
      button.className = "btn";
      button.textContent = "Delete file";
      button.onclick = async () => {
        try {
          await api("uploads/" + file.id, "DELETE");
          await load();
        } catch (error) {
          report(error);
        }
      };
      const download = document.createElement("button");
      download.className = "btn";
      download.textContent = "Download file";
      download.onclick = async () => {
        try {
          const response = await fetch("/api/uploads/" + file.id, {
            headers: tenantHeaders(),
          });
          if (!response.ok)
            throw new Error("Download unavailable or tenant access revoked");
          const url = URL.createObjectURL(await response.blob()),
            a = document.createElement("a");
          a.href = url;
          a.download = file.filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          report(error);
        }
      };
      li.append(download, button);
      list.append(li);
    }
  };
  root.querySelector<HTMLElement>("#more-private-files")!.onclick = () =>
    void load(true).catch(report);
  void load().catch(report);
  root.querySelector<HTMLButtonElement>("#privacy-save")!.onclick =
    async () => {
      try {
        await api("privacy", "PATCH", {
          training:
            root.querySelector<HTMLInputElement>("#privacy-training")!.checked,
          sale: root.querySelector<HTMLInputElement>("#privacy-sale")!.checked,
        });
        status.textContent =
          "Consent choices saved. Future eligible exports follow these choices. No model is automatically retrained.";
      } catch (error) {
        report(error);
      }
    };
  root.querySelector<HTMLButtonElement>("#private-upload")!.onclick =
    async () => {
      try {
        const file =
          root.querySelector<HTMLInputElement>("#private-file")!.files?.[0];
        if (!file) throw new Error("Choose a file");
        if (!root.querySelector<HTMLInputElement>("#upload-authority")!.checked)
          throw new Error("Confirm authority and redaction");
        if (file.size > 25 * 1024 * 1024) throw new Error("File exceeds 25 MB");
        const response = await fetch("/api/uploads", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-File-Name": encodeURIComponent(file.name),
            "X-Upload-Authority": "confirmed",
            ...tenantHeaders(),
          },
          body: file,
        });
        if (!response.ok)
          throw new Error((await response.json()).error ?? "Upload failed");
        status.textContent = "File uploaded privately to Sourcy Inc.";
        await load();
      } catch (error) {
        report(error);
      }
    };
  root.querySelector<HTMLButtonElement>("#account-logout")!.onclick =
    async () => {
      try {
        await api("logout", "POST");
        window.location.reload();
      } catch (error) {
        report(error);
      }
    };
  root.querySelector<HTMLButtonElement>("#account-delete")!.onclick =
    async () => {
      if (
        !confirm(
          "Delete your account, all cases you own (including collaborators’ access) and all active uploaded files? Local JSON exports and browser case storage are separate and will remain until you remove them.",
        )
      )
        return;
      try {
        await api("account", "DELETE");
        window.location.reload();
      } catch (error) {
        report(error);
      }
    };
}
