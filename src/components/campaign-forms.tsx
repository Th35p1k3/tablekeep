"use client";

import { useActionState, useState } from "react";
import {
  changeMemberRole,
  createCampaign,
  createInvite,
  deleteCampaign,
  joinCampaign,
  transferOwnership,
  updateCampaign,
} from "@/lib/campaigns/actions";
import { type FormState, idleState } from "@/lib/forms";
import {
  Field,
  FormMessage,
  SubmitButton,
  TextAreaField,
  secondaryButtonClass,
  selectClass,
} from "./ui";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

export function CampaignDetailsForm({
  campaign,
}: {
  campaign?: { id: string; name: string; game_system: string; description: string };
}) {
  const [state, action, pending] = useActionState(
    campaign ? updateCampaign : createCampaign,
    idleState,
  );
  const v = state.values;
  return (
    <form action={action} className="space-y-4" noValidate>
      {campaign ? <Hidden fields={{ campaignId: campaign.id }} /> : null}
      <Field
        label="Campaign name"
        name="name"
        defaultValue={v?.name ?? campaign?.name}
        error={state.fieldErrors?.name}
      />
      <Field
        label="Game system"
        name="gameSystem"
        defaultValue={v?.gameSystem ?? campaign?.game_system}
        error={state.fieldErrors?.gameSystem}
        hint="Any label, for example “Homebrew 5e”. Optional."
      />
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={v?.description ?? campaign?.description}
        error={state.fieldErrors?.description}
        hint="What players should know. Optional."
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>
        {campaign ? "Save changes" : "Create campaign"}
      </SubmitButton>
    </form>
  );
}

/** A single button that runs an action, with an optional "are you sure?". */
export function ActionButton({
  action,
  fields,
  label,
  confirmText,
  danger,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  confirmText?: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <Hidden fields={fields} />
      <button
        type="submit"
        disabled={pending}
        className={`${secondaryButtonClass} ${danger ? "text-red-700 dark:text-red-400" : ""}`}
      >
        {pending ? "Working…" : label}
      </button>
      {state.status === "error" && state.message ? (
        <span className="text-sm text-red-700 dark:text-red-400">{state.message}</span>
      ) : null}
    </form>
  );
}

export function CreateInviteForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(createInvite, idleState);
  const [copied, setCopied] = useState(false);
  const link = state.status === "success" ? state.values?.link : undefined;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        <Hidden fields={{ campaignId }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Expires after (days)"
            name="days"
            type="number"
            defaultValue={state.values?.days ?? "7"}
            error={state.fieldErrors?.days}
          />
          <Field
            label="Number of uses"
            name="maxUses"
            type="number"
            defaultValue={state.values?.maxUses ?? "10"}
            error={state.fieldErrors?.maxUses}
          />
        </div>
        <FormMessage status={state.status} message={state.message} />
        <SubmitButton pending={pending}>Create invite link</SubmitButton>
      </form>

      {link ? (
        <div className="space-y-2">
          <label htmlFor="invite-link" className="block text-sm font-medium">
            Your invite link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="invite-link"
              data-testid="invite-link"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className={`${selectClass} font-mono text-sm`}
            />
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Send it to your players by text, Discord or email. They’ll need to
            log in or sign up (with an email on your invite list) to join.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function RoleSelectForm({
  campaignId,
  userId,
  currentRole,
}: {
  campaignId: string;
  userId: string;
  currentRole: "co_dm" | "player";
}) {
  const [state, action, pending] = useActionState(changeMemberRole, idleState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Hidden fields={{ campaignId, userId }} />
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role
      </label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        className={`${selectClass} w-auto py-1.5 text-sm`}
      >
        <option value="player">Player</option>
        <option value="co_dm">Co-DM</option>
      </select>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Saving…" : "Save role"}
      </button>
      {state.status === "error" && state.message ? (
        <span className="text-sm text-red-700 dark:text-red-400">{state.message}</span>
      ) : null}
    </form>
  );
}

export function TransferOwnershipForm({
  campaignId,
  candidates,
}: {
  campaignId: string;
  candidates: Array<{ user_id: string; display_name: string }>;
}) {
  const [state, action, pending] = useActionState(transferOwnership, idleState);
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Invite someone first. You can only hand the campaign to a member.
      </p>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Hand this campaign to them? You’ll become a Co-DM.")) {
          e.preventDefault();
        }
      }}
      className="space-y-4"
    >
      <Hidden fields={{ campaignId }} />
      <div className="space-y-1.5">
        <label htmlFor="transfer-user" className="block text-sm font-medium">
          New owner
        </label>
        <select id="transfer-user" name="userId" defaultValue="" className={selectClass}>
          <option value="" disabled>
            Choose a member…
          </option>
          {candidates.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.userId ? (
          <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.userId}</p>
        ) : null}
      </div>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Hand over campaign</SubmitButton>
    </form>
  );
}

export function DeleteCampaignForm({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [state, action, pending] = useActionState(deleteCampaign, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Hidden fields={{ campaignId }} />
      <Field
        label={`Type “${campaignName}” to confirm`}
        name="confirm"
        autoComplete="off"
        error={state.fieldErrors?.confirm}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} variant="danger">
        Delete campaign
      </SubmitButton>
    </form>
  );
}

export function JoinCampaignForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(joinCampaign, idleState);
  return (
    <form action={action} className="space-y-4">
      <Hidden fields={{ token }} />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Join campaign</SubmitButton>
    </form>
  );
}
