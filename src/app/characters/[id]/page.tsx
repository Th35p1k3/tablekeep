import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { RenameCharacterForm } from "@/components/character-forms";
import { CharacterSheet } from "@/components/character-sheet";
import { CharacterSpellsPanel } from "@/components/character-spells";
import { InventoryPanel } from "@/components/inventory-panel";
import { loadCharacterSpells, loadMyLatestSpellVersions } from "@/lib/spells/queries";
import { ChooseAndSubmitForm } from "@/components/party-forms";
import { ReadOnlySheet } from "@/components/sheet-view";
import { Badge, Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/campaigns/validation";
import { deleteCharacter, duplicateCharacter } from "@/lib/characters/actions";
import { loadCharacter, loadRestorePoints } from "@/lib/characters/queries";
import { loadInventory } from "@/lib/inventory/queries";
import { addCharacterToCampaign, removeCharacterFromCampaign } from "@/lib/party/actions";
import { loadCharacterCampaign, loadMyActiveCampaigns } from "@/lib/party/queries";
import { coerceDefinition } from "@/lib/templates/editing";

async function CharacterContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser();
  const character = await loadCharacter(supabase, id);
  if (!character) notFound();

  const isOwner = character.owner_id === user.id;
  const definition = coerceDefinition(character.definition);
  const [items, campaign, spells] = await Promise.all([
    loadInventory(supabase, character.id),
    loadCharacterCampaign(supabase, character.id),
    loadCharacterSpells(supabase, character.id),
  ]);
  const fields = { characterId: character.id };

  const header = (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold break-words">{character.name}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge>
          {character.templateName}
          {character.versionNumber ? ` · version ${character.versionNumber}` : ""}
        </Badge>
        {campaign ? <Badge tone="accent">{campaign.name}</Badge> : null}
        {!isOwner ? <Badge>View only</Badge> : null}
      </div>
    </div>
  );

  if (!isOwner) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", character.owner_id)
      .maybeSingle();
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Played by {owner?.display_name ?? "another player"}. Only they can change this sheet.
        </p>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <Card>
            <ReadOnlySheet definition={definition} values={character.data} />
          </Card>
          <div className="space-y-6">
            <CharacterSpellsPanel characterId={character.id} initialSpells={spells} available={[]} readOnly />
            <InventoryPanel characterId={character.id} initialItems={items} readOnly />
          </div>
        </div>
      </div>
    );
  }

  const [points, campaigns, spellOptions] = await Promise.all([
    loadRestorePoints(supabase, character.id),
    campaign ? Promise.resolve([] as Array<{ id: string; name: string }>) : loadMyActiveCampaigns(supabase, user.id),
    loadMyLatestSpellVersions(supabase, user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {header}
        <div className="flex flex-wrap gap-2">
          <ActionButton action={duplicateCharacter} fields={fields} label="Make a copy" />
          <ActionButton
            action={deleteCharacter}
            fields={fields}
            label="Delete character"
            confirmText={`Delete “${character.name}”, its inventory and all its restore points? This can’t be undone.`}
            danger
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <details className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <summary className="cursor-pointer font-medium">Rename</summary>
          <div className="mt-4">
            <RenameCharacterForm characterId={character.id} name={character.name} />
          </div>
        </details>
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="font-medium">Campaign</h2>
          {campaign ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>
                In{" "}
                <Link href={`/campaigns/${campaign.id}`} className={linkClass}>
                  {campaign.name}
                </Link>
              </span>
              <ActionButton
                action={removeCharacterFromCampaign}
                fields={{ campaignId: campaign.id, characterId: character.id }}
                label="Remove from campaign"
                confirmText={`Take ${character.name} out of ${campaign.name}?`}
              />
            </div>
          ) : campaigns.length ? (
            <div className="mt-2">
              <ChooseAndSubmitForm
                action={addCharacterToCampaign}
                fixed={{ characterId: character.id }}
                name="campaignId"
                label="Add to a campaign"
                options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
                submitLabel="Add to campaign"
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Not in a campaign. Join one with an invite link to add this character.
            </p>
          )}
        </div>
      </div>

      <CharacterSheet
        characterId={character.id}
        definition={definition}
        initialData={character.data}
        initialUpdatedAt={character.updated_at}
        initialPoints={points}
      />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <CharacterSpellsPanel characterId={character.id} initialSpells={spells} available={spellOptions} />
        <InventoryPanel characterId={character.id} initialItems={items} />
      </div>
    </div>
  );
}

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/characters" className={linkClass}>
          ← Back to characters
        </Link>
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <CharacterContent params={params} />
      </Suspense>
    </main>
  );
}
