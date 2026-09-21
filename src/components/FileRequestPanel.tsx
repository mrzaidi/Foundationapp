"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import Modal from "./Modal";
import MemberPicker, { type Candidate } from "./MemberPicker";
import BankFields, { EMPTY_BANK, type BankForm } from "./BankFields";
import { useToast } from "./Toast";
import { hasBankDetails } from "@/lib/banks";
import { bytes, money } from "@/lib/format";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

/** What the documents bucket accepts, and its per-file ceiling. */
const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];
const MAX_BYTES = 10 * 1024 * 1024;

export interface FundOption {
  id: string;
  name: string;
  min_amount: number;
  max_amount: number | null;
}

/**
 * The member search returns whole profile rows, so when the bank columns are
 * provisioned they arrive with the pick. That lets the form ask for the
 * details at the moment the member is chosen rather than after a refused
 * submit — though the server's refusal is still honoured, because the columns
 * may not be there yet and the row may have changed since.
 */
type Picked = Candidate & {
  bank_name?: string | null;
  bank_account_title?: string | null;
  bank_account_number?: string | null;
};

/**
 * File an application for somebody who cannot file it themselves.
 *
 * Someone arrives at the office with a hospital bill and no smartphone; a
 * household is registered on a relative's phone. The application this produces
 * is an ordinary one — it starts at Requested, it shows on the member's own
 * screens as theirs, and it is approved and transferred by the same hands
 * under the same rules. Filing is not deciding, and nothing here shortens the
 * queue.
 */
export default function FileRequestPanel({ funds }: { funds: FundOption[] }) {
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");

  const [bank, setBank] = useState<BankForm>(EMPTY_BANK);
  /** Set when the server refuses for want of bank details, so the form opens. */
  const [bankForced, setBankForced] = useState(false);
  const [bankErrors, setBankErrors] = useState<
    Partial<Record<keyof BankForm, string>>
  >({});

  const [files, setFiles] = useState<File[]>([]);

  const [error, setError] = useState("");

  /**
   * The bucket refuses anything outside its allowlist and anything over 10MB,
   * but it refuses it after the upload has been sent. Checking here means a
   * wrong file is named on the spot rather than failing halfway through
   * filing, when the application already exists.
   */
  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const taken: File[] = [];
    const refused: string[] = [];

    for (const file of Array.from(list)) {
      if (!ACCEPTED.includes(file.type))
        refused.push(`${file.name} — not a photo or PDF`);
      else if (file.size > MAX_BYTES) refused.push(`${file.name} — over 10MB`);
      else taken.push(file);
    }

    if (taken.length) setFiles((current) => [...current, ...taken]);
    if (refused.length) toast(refused.join("; "), "bad");
  }

  const fund = funds.find((f) => f.id === fundId);

  // Visible when the picked member's row shows the columns and they are empty.
  const bankMissing = Boolean(
    picked && "bank_name" in picked && !hasBankDetails(picked),
  );
  const showBank = bankMissing || bankForced;

  function reset() {
    setPicked(null);
    setFundId("");
    setAmount("");
    setPurpose("");
    setFiles([]);
    setBank(EMPTY_BANK);
    setBankForced(false);
    setBankErrors({});
    setError("");
  }

  function close() {
    if (busy) return;
    setOpen(false);
    reset();
  }

  async function file() {
    setError("");
    setBankErrors({});

    if (!picked) return setError("Choose a member.");
    if (!fundId) return setError("Select a fund.");
    if (amount === "" || !(Number(amount) > 0))
      return setError("Enter a valid amount.");

    setBusy(true);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: picked.id,
          fund_type_id: fundId,
          amount_requested: Number(amount),
          purpose: purpose.trim() || null,
          ...(showBank ? bank : {}),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.code === "bank_required") setBankForced(true);
        if (json.code === "bank_invalid" && json.field)
          setBankErrors({ [json.field as keyof BankForm]: json.error });
        setError(json.error ?? "Could not file the application.");
        return;
      }

      /*
       * Attachments go up after the application exists, because each one is
       * filed against its id. They land in the member's own storage folder —
       * the only place the attachments endpoint will accept them — so the
       * member sees the bill they brought in, in their own case file.
       *
       * A file that fails to upload is reported and the rest continue. The
       * application is already filed by this point and is not worth throwing
       * away over one photograph, which can be added again from the case.
       */
      const requestId: string = json.request.id;
      let attached = 0;

      if (files.length) {
        const storage = createBrowserClient();
        const uploaded: {
          path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
        }[] = [];

        for (const file of files) {
          const safe = file.name.replace(/[^\w.\-]+/g, "_");
          const path = `${picked.id}/requests/${requestId}/${Date.now()}-${safe}`;
          const { error: upErr } = await storage.storage
            .from("documents")
            .upload(path, file, { contentType: file.type, upsert: false });

          if (upErr) {
            toast(`Could not upload ${file.name}.`, "bad");
            continue;
          }
          uploaded.push({
            path,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          });
        }

        if (uploaded.length) {
          const rec = await fetch(`/api/requests/${requestId}/attachments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              files: uploaded,
              kind: fundId === "electricity" ? "bill" : "report",
            }),
          });
          if (rec.ok) attached = uploaded.length;
          else
            toast(
              "The application was filed, but the documents were not recorded.",
              "bad",
            );
        }
      }

      const reference = json.request?.reference ?? "the application";
      toast(
        attached
          ? `Filed ${reference} for ${picked.full_name} with ${attached} document${attached === 1 ? "" : "s"}`
          : `Filed ${reference} for ${picked.full_name}`,
      );
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Could not file the application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="admin-btn" type="button" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        File an application
      </button>

      {/* Through a portal, because the button sits in the topbar and the topbar
          carries a backdrop-filter — which makes it the containing block for
          anything fixed inside it. Rendered inline, the overlay was measured
          against an 85px strip and the dialog's heading and member search were
          clipped above the top of the screen. */}
      {open && (
        <Modal
          onClose={close}
          busy={busy}
          className="roomy pinned"
          label="File an application"
        >
          <h3>File an application</h3>
          <p className="sub">
            For a member who cannot file their own. It starts at Requested and
            goes through review, approval and transfer exactly like any other.
          </p>

          <div className="amodal-scroll">
            <div className="form-grid">
              <div className="field span-2">
                <label>Member</label>
                <MemberPicker
                  value={picked}
                  onPick={(m) => {
                    setPicked(m as Picked | null);
                    setBankForced(false);
                    setBankErrors({});
                    setError("");
                  }}
                  source="members"
                  placeholder="Search the roll by name, email or mobile…"
                />
              </div>

              <div className="field">
                <label htmlFor="fr_fund">Fund</label>
                <select
                  id="fr_fund"
                  className="input"
                  value={fundId}
                  onChange={(e) => setFundId(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a fund…
                  </option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="fr_amount">Amount requested (PKR)</label>
                <input
                  id="fr_amount"
                  className="input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={fund ? String(fund.min_amount) : "0"}
                />
                {fund && (
                  <p className="field-hint">
                    {money(Number(fund.min_amount), false)}
                    {fund.max_amount
                      ? ` to ${money(Number(fund.max_amount), false)}`
                      : " and above"}{" "}
                    for {fund.name}.
                  </p>
                )}
              </div>

              <div className="field span-2">
                <label htmlFor="fr_purpose">What it is for</label>
                <textarea
                  id="fr_purpose"
                  className="input"
                  rows={3}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="The circumstances, in the member’s own words where possible."
                />
              </div>

              <div className="field span-2">
                <label htmlFor="fr_files">Documents</label>
                <input
                  id="fr_files"
                  className="input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <p className="field-hint">
                  The bill, the report, the prescription — whatever was brought
                  in. Photographs or PDFs, up to 10MB each. They are filed
                  against the member, so the member and the committee both see
                  them.
                </p>

                {files.length > 0 && (
                  <div className="filelist">
                    {files.map((f, i) => (
                      <div className="fileitem" key={`${f.name}-${i}`}>
                        <div className="fi">
                          <Icon
                            name={
                              f.type.startsWith("image/") ? "image" : "file"
                            }
                          />
                        </div>
                        <div className="fmid">
                          <div className="fn" dir="ltr">
                            {f.name}
                          </div>
                          <div className="fs">{bytes(f.size)}</div>
                        </div>
                        <button
                          type="button"
                          className="rm"
                          aria-label={`Remove ${f.name}`}
                          onClick={() =>
                            setFiles((list) => list.filter((_, n) => n !== i))
                          }
                          disabled={busy}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {showBank && (
                <div className="span-2">
                  <p
                    className="field-hint"
                    style={{ marginTop: 0, marginBottom: 12 }}
                  >
                    <strong>{picked?.full_name ?? "This member"}</strong> has no
                    bank details on file, and the foundation will not approve
                    money with nowhere to send it. Take them down here — they
                    are saved to the member’s own profile.
                  </p>
                  <BankFields
                    value={bank}
                    onChange={setBank}
                    errors={bankErrors}
                    idPrefix="fr_bank"
                  />
                </div>
              )}
            </div>

            {error && <p className="err-msg">{error}</p>}
          </div>

          <div className="amodal-foot">
            <button
              className="admin-btn ghost"
              type="button"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="admin-btn"
              type="button"
              onClick={file}
              disabled={busy}
            >
              {busy ? <span className="spin" /> : <Icon name="check" />}
              File application
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
