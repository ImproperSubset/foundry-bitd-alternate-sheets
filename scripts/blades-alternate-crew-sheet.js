import { BladesCrewSheet as SystemCrewSheet } from "../../../systems/blades-in-the-dark/module/blades-crew-sheet.js";
import { Utils } from "./utils.js";

/**
 * Alternate crew sheet that mirrors the functionality of the system sheet
 * while adding full ability/upgrade catalogs with checkboxes (like the
 * alternate character sheet).
 */
export class BladesAlternateCrewSheet extends SystemCrewSheet {
  /** @override */
  static get defaultOptions() {
    const baseClasses = super.defaultOptions?.classes ?? [];
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [...new Set([...baseClasses, "blades-alt"])],
      template: "modules/bitd-alternate-sheets/templates/crew-sheet.html",
      width: 940,
      height: 940,
      tabs: [
        { navSelector: ".tabs", contentSelector: ".tab-content", initial: "turfs" },
      ],
    });
  }

  /** @override */
  async getData(options) {
    const sheetData = await super.getData(options);
    // The system sheet returns a data object; mirror actor/system for template parity.
    sheetData.actor = sheetData.data ?? sheetData.actor ?? this.actor;
    sheetData.system = sheetData.system ?? this.actor.system;
    sheetData.editable = this.options.editable;
    sheetData.allow_edit = this.options.editable;

    // Cache selected crew type (if present) to contextualize ability/upgrade lists.
    const crewTypeItem = this.actor.items.find((item) => item.type === "crew_type");
    const crewTypeName = crewTypeItem?.name ?? "";
    sheetData.selected_crew_type = crewTypeItem ?? null;

    sheetData.available_crew_abilities = await this._buildChoiceList(
      "crew_ability",
      crewTypeName
    );
    sheetData.available_crew_upgrades = await this._buildChoiceList(
      "crew_upgrade",
      crewTypeName
    );

    return sheetData;
  }

  /**
   * Build a complete list of candidate items (abilities/upgrades) with ownership markers.
   */
  async _buildChoiceList(type, crewTypeName) {
    const sources = (await Utils.getSourcedItemsByType(type)) ?? [];
    const owned = this.actor.items.filter((item) => item.type === type);
    const matchesCrewType = (item) => {
      const key =
        foundry.utils.getProperty(item, "system.class") ??
        foundry.utils.getProperty(item, "system.crew_type") ??
        "";
      if (!key) return true;
      if (!crewTypeName) return true;
      return key === crewTypeName;
    };

    return sources
      .filter((item) => matchesCrewType(item))
      .map((item) => {
        const ownedMatch =
          owned.find((o) => o.id === item.id) ??
          owned.find((o) => o.name === item.name);
        return {
          id: item.id,
          _id: item.id,
          name: item.name,
          img: item.img,
          system: item.system,
          ownedId: ownedMatch?.id ?? "",
          owned: Boolean(ownedMatch),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.options.editable) return;

    html.on("change", ".crew-ability-checkbox", (event) =>
      this._onChoiceToggle(event, "crew_ability")
    );
    html.on("change", ".crew-upgrade-checkbox", (event) =>
      this._onChoiceToggle(event, "crew_upgrade")
    );
  }

  async _onChoiceToggle(event, type) {
    const checkbox = event.currentTarget;
    const sourceId = checkbox.dataset.itemId;
    const itemName = checkbox.dataset.itemName;
    const checked = checkbox.checked;

    if (checked) {
      await this._ensureOwned(type, sourceId);
    } else {
      await this._removeOwned(type, sourceId, itemName);
    }
  }

  async _ensureOwned(type, sourceId) {
    if (this.actor.items.some((i) => i.type === type && (i.id === sourceId))) {
      return;
    }

    const source = await Utils.getItemByType(type, sourceId);
    if (!source) return;

    const data =
      typeof source.toObject === "function"
        ? source.toObject()
        : {
            type: source.type,
            name: source.name,
            system: foundry.utils.deepClone(source.system ?? {}),
            img: source.img,
          };

    // Ensure a fresh ID so Foundry treats this as a new embedded document.
    delete data._id;
    await this.actor.createEmbeddedDocuments("Item", [data]);
  }

  async _removeOwned(type, sourceId, itemName) {
    const existing =
      this.actor.items.find((i) => i.type === type && i.id === sourceId) ??
      this.actor.items.find((i) => i.type === type && i.name === itemName);
    if (!existing) return;
    await this.actor.deleteEmbeddedDocuments("Item", [existing.id]);
  }
}
