import { BladesSheet } from "../../../systems/blades-in-the-dark/module/blades-sheet.js";
import { BladesActiveEffect } from "../../../systems/blades-in-the-dark/module/blades-active-effect.js";
import { Utils, MODULE_ID } from "./utils.js";
import { Profiler } from "./profiler.js";
import { queueUpdate } from "./lib/update-queue.js";
import { openCrewSelectionDialog, openCardSelectionDialog, confirmDialog } from "./lib/dialog-compat.js";
import { enrichHTML } from "./compat.js";
import { initDockableSections } from "./ui/dockable-sections.js";
import { handleSmartEdit, openAcquaintanceChooser as openAcquaintanceChooserHelper, openItemChooser as openItemChooserHelper } from "./sheets/actor/smart-edit.js";

// import { migrateWorld } from "../../../systems/blades-in-the-dark/module/migration.js";

/**
 * Pure chaos
 * @extends {BladesSheet}
 */
export class BladesAlternateActorSheet extends BladesSheet {
  // playbookChangeOptions = {};
  coins_open = false;
  harm_open = false;
  load_open = false;
  allow_edit = undefined;
  show_debug = false;

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["blades-alt", "sheet", "pc", "actor"],
      template: "modules/bitd-alternate-sheets/templates/actor-sheet.html",
      width: 800,
      height: 1200,
      tabs: [
        {
          navSelector: ".tabs",
          contentSelector: ".tab-content",
          initial: "playbook",
        },
      ],
    });
  }

  /** @override **/
  async _onDropItem(event, droppedItem) {
    await super._onDropItem(event, droppedItem);
    if (!this.actor.isOwner) {
      ui.notifications.error(
        `You do not have sufficient permissions to edit this character. Please speak to your GM if you feel you have reached this message in error.`,
        { permanent: true }
      );
      return false;
    }
    await this.handleDrop(event, droppedItem);
  }

  setLocalProp(propName, value) {
    this[propName] = value;
    this.render(false);
  }

  /** @override **/
  async _onDropActor(event, droppedActor) {
    await super._onDropActor(event, droppedActor);
    if (!this.actor.isOwner) {
      ui.notifications.error(
        `You do not have sufficient permissions to edit this character. Please speak to your GM if you feel you have reached this message in error.`,
        { permanent: true }
      );
      return false;
    }
    await this.handleDrop(event, droppedActor);
  }

  /** @override **/
  async handleDrop(event, droppedEntity) {
    let droppedEntityFull = await fromUuid(droppedEntity.uuid);
    switch (droppedEntityFull.type) {
      case "npc":
        await Utils.addAcquaintance(this.actor, droppedEntityFull);
        // await this.actor.addAcquaintance(droppedEntityFull);
        break;
      case "item":
        // just let Foundry do its thing
        break;
      case "ability":
        // just let Foundry do its thing
        break;
      case "class":
        await this._onPlaybookChange(droppedEntityFull);
        break;
      default:
        // await this.actor.setUniqueDroppedItem(droppedEntityFull);
        // await this.onDroppedDistinctItem(droppedEntityFull);
        break;
    }
  }

  async switchPlaybook(newPlaybookItem) {
    await this._resetAbilityProgressFlags();
    await this.switchToPlaybookAcquaintances(newPlaybookItem);
    await this.setPlaybookAttributes(newPlaybookItem);
    // Rendering will occur from document updates; avoid extra scheduled rerenders here.
  }

  async switchToPlaybookAcquaintances(selected_playbook) {
    let playbook_acquaintances = [];
    if (selected_playbook) {
      let all_acquaintances = await Utils.getSourcedItemsByType("npc");
      playbook_acquaintances = all_acquaintances.filter((item) => {
        return item.system.associated_class.trim() === selected_playbook.name;
      });
    }

    let current_acquaintances = this.actor.system.acquaintances ?? [];
    let neutral_acquaintances = current_acquaintances.filter(
      (acq) => acq.standing === "neutral"
    );
    await Utils.removeAcquaintanceArray(this.actor, neutral_acquaintances);
    if (playbook_acquaintances.length > 0) {
      await Utils.addAcquaintanceArray(this.actor, playbook_acquaintances);
    }
  }

  // async switchPlaybook(newPlaybookItem){
  //   // show confirmation (ask for items to replace) - not doing this. can't be bothered. sry.
  //   // remove old playbook (done automatically somewhere else. tbh I don't know where)
  //   // add abilities - not adding. virtual!
  //   // add items - virtual!
  //   // add acquaintances - should be virtual?

  //   await this.switchToPlaybookAcquaintances(newPlaybookItem);
  //   await this.setPlaybookAttributes(newPlaybookItem);
  //   // return newPlaybookItem;
  //   // set skills
  // }

  async generateAddExistingItemDialog(item_type) {
    let all_items = await Utils.getSourcedItemsByType(item_type);
    all_items = Utils.filterItemsForDuplicatesOnActor(
      all_items,
      item_type,
      this.actor,
      true
    );
    let grouped_items = {};

    let items_html = '<div class="items-list">';
    all_items = all_items.filter((i) => !i.name.includes("Veteran"));
    let sorted_grouped_items = Utils.groupItemsByClass(all_items);

    for (const [itemclass, group] of Object.entries(sorted_grouped_items)) {
      items_html += `<div class="item-group"><header>${itemclass}</header>`;
      for (const item of group) {
        let trimmedname = Utils.trimClassFromName(item.name);
        let strip = Utils.strip;
        let description = item.system.description.replace(/"/g, "&quot;");
        items_html += `
            <div class="item-block">
              <input type="checkbox" id="character-${this.actor.id
          }-${item_type}add-${item.id}" data-${item_type}-id="${item.id}" >
              <label for="character-${this.actor.id}-${item_type}add-${item.id
          }" title="${strip(
            description
          )}" class="hover-term">${trimmedname}</label>
            </div>
          `;
      }
      items_html += "</div>";
    }

    items_html += "</div>";

    let d = new Dialog(
      {
        title: game.i18n.localize(
          "bitd-alt.AddExisting" + Utils.capitalizeFirstLetter(item_type)
        ),
        content: `<h3>${game.i18n.localize(
          "bitd-alt.SelectToAdd" + Utils.capitalizeFirstLetter(item_type)
        )}</h3>
                    ${items_html}
                    `,
        buttons: {
          add: {
            icon: "<i class='fas fa-check'></i>",
            label: game.i18n.localize("BITD.Add"),
            callback: async (html) => {
              let itemInputs = html.find("input:checked");
              let items = [];
              for (const itemelement of itemInputs) {
                let item = await Utils.getItemByType(
                  item_type,
                  itemelement.dataset[item_type + "Id"]
                );
                items.push(item);
              }
              this.actor.createEmbeddedDocuments("Item", items);
            },
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: game.i18n.localize("bitd-alt.Cancel"),
            callback: () => { },
          },
        },
        render: (html) => {
          this.addTermTooltips(html);
        },
        close: (html) => { },
      },
      { classes: ["add-existing-dialog"], width: "650" }
    );
    d.render(true);
  }

  itemContextMenu = [
    {
      name: game.i18n.localize("BITD.TitleDeleteItem"),
      icon: '<i class="fas fa-trash"></i>',
      callback: (element) => {
        const itemId = this.getContextMenuElementData(element, "itemId");
        if (!itemId) return;
        this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      },
    },
  ];

  itemListContextMenu = [
    {
      name: game.i18n.localize("bitd-alt.AddNewItem"),
      icon: '<i class="fas fa-plus"></i>',
      callback: async (element) => {
        await this.addNewItem();
      },
    },
    {
      name: game.i18n.localize("bitd-alt.AddExistingItem"),
      icon: '<i class="fas fa-plus"></i>',
      callback: async (element) => {
        await this.generateAddExistingItemDialog("item", this.actor);
      },
    },
  ];

  traumaListContextMenu = [
    {
      name: game.i18n.localize("bitd-alt.DeleteItem"),
      icon: '<i class="fas fa-trash"></i>',
      callback: (element) => {
        const traumaToDisable = this.getContextMenuElementData(
          element,
          "trauma"
        );
        if (!traumaToDisable) return;
        let traumaUpdateObject = this.actor.system.trauma.list;
        traumaUpdateObject[traumaToDisable.toLowerCase()] = false;
        // let index = traumaUpdateObject.indexOf(traumaToDisable.toLowerCase());
        // traumaUpdateObject.splice(index, 1);
        queueUpdate(() =>
          this.actor.update({
            system: { trauma: { list: traumaUpdateObject } },
          })
        );
      },
    },
  ];

  abilityContextMenu = [
    {
      name: game.i18n.localize("bitd-alt.DeleteAbility"),
      icon: '<i class="fas fa-trash"></i>',
      callback: (element) => {
        const target =
          element instanceof HTMLElement
            ? element
            : element?.currentTarget ?? (element?.length ? element[0] : null);
        const block = target?.closest?.(".ability-block") || null;
        const abilityName =
          block?.dataset?.abilityName ||
          this.getContextMenuElementData(element, "abilityName") ||
          "";
        const abilityId =
          this.getContextMenuElementData(element, "abilityId") ||
          block?.dataset?.abilityOwnedId ||
          block?.dataset?.abilityId ||
          "";
        const deletionId = this._resolveAbilityDeletionId(
          block,
          abilityId,
          abilityName
        );
        if (!deletionId) return;
        this.actor.deleteEmbeddedDocuments("Item", [deletionId]);
        if (block) block.dataset.abilityOwnedId = "";
      },
    },
  ];

  acquaintanceContextMenu = [
    {
      name: game.i18n.localize("bitd-alt.DeleteItem"),
      icon: '<i class="fas fa-trash"></i>',
      callback: (element) => {
        const acquaintanceId = this.getContextMenuElementData(
          element,
          "acquaintance"
        );
        if (!acquaintanceId) return;
        Utils.removeAcquaintance(this.actor, acquaintanceId);
        // this.actor.deleteEmbeddedDocuments("Item", [element.data("ability-id")]);
      },
    },
  ];

  abilityListContextMenu = [
    {
      name: game.i18n.localize("bitd-alt.AddNewAbility"),
      icon: '<i class="fas fa-plus"></i>',
      callback: async (element) => {
        await this.addNewAbility();
      },
    },
    {
      name: game.i18n.localize("bitd-alt.AddExistingAbility"),
      icon: '<i class="fas fa-plus"></i>',
      callback: async (element) => {
        await this.generateAddExistingItemDialog("ability", this.actor);
      },
    },
  ];

  getContextMenuElementData(element, datasetKey) {
    if (!element) return undefined;
    const attrKey = datasetKey.replace(
      /([A-Z])/g,
      (match) => `-${match.toLowerCase()}`
    );
    const target =
      element instanceof HTMLElement
        ? element
        : element?.currentTarget ?? (element?.length ? element[0] : undefined);

    if (target?.dataset?.[datasetKey] !== undefined) {
      return target.dataset[datasetKey];
    }

    if (target?.getAttribute) {
      const attrValue = target.getAttribute(`data-${attrKey}`);
      if (attrValue !== null) return attrValue;
    }

    if (typeof element?.data === "function") {
      return element.data(attrKey);
    }

    return undefined;
  }

  async addNewItem() {
    let playbook_name = "custom";
    let item_data_model = game.model.Item.item;
    let new_item_data = {
      name: "New Item",
      type: "item",
      system: { ...item_data_model },
    };
    new_item_data.system.class = "custom";
    new_item_data.system.load = 1;

    let new_item = await this.actor.createEmbeddedDocuments(
      "Item",
      [new_item_data],
      { renderSheet: true }
    );
    return new_item;
  }

  async addNewAbility() {
    let playbook_name = "custom";
    let ability_data_model = game.model.Item.ability;
    let new_ability_data = {
      name: "New Ability",
      type: "ability",
      system: { ...ability_data_model },
    };
    new_ability_data.system.class = "custom";

    let new_abilities = await this.actor.createEmbeddedDocuments(
      "Item",
      [new_ability_data],
      { renderSheet: true }
    );
    let new_ability = new_abilities[0];
    await new_ability.setFlag(MODULE_ID, "custom_ability", true);

    return new_ability;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const baseData = await super.getData();
    Utils.ensureAllowEdit(this);
    const persistedUi = await Utils.loadUiState(this);
    const sheetData = await this._initViewModel(baseData, persistedUi);

    await this._applyCrewInfo(sheetData);
    await this._applyAttributes(sheetData);
    await this._applyDescriptions(sheetData);
    this._applyLoadLevels(sheetData);
    await this._applyPlaybookAndAbilities(sheetData);
    await this._applyItems(sheetData);
    await this._applyLoad(sheetData);
    this._applyFilters(sheetData);

    return sheetData;
  }

  async _initViewModel(sheetData, persistedUi) {
    if (typeof this.showFilteredAbilities === "undefined") {
      this.showFilteredAbilities = Boolean(persistedUi.showFilteredAbilities);
    }
    if (typeof this.showFilteredItems === "undefined") {
      this.showFilteredItems = Boolean(persistedUi.showFilteredItems);
    }
    if (typeof this.showFilteredAcquaintances === "undefined") {
      this.showFilteredAcquaintances = Boolean(
        persistedUi.showFilteredAcquaintances
      );
    }
    this.collapsedSections =
      this.collapsedSections ||
      persistedUi.collapsedSections ||
      {};
    sheetData.editable = this.options.editable;
    sheetData.isGM = game.user.isGM;
    sheetData.showAliasInDirectory = this.actor.getFlag(
      "bitd-alternate-sheets",
      "showAliasInDirectory"
    );
    const actorData = sheetData.data;
    actorData.uuid = this.actor.uuid;
    sheetData.actor = actorData;
    sheetData.system = actorData.system;
    sheetData.coins_open = this.coins_open;
    sheetData.harm_open = this.harm_open;
    sheetData.load_open = this.load_open;
    sheetData.allow_edit = this.allow_edit;
    sheetData.show_debug = this.show_debug;
    sheetData.effects = BladesActiveEffect.prepareActiveEffectCategories(
      this.actor.effects
    );
    const rawNotes = this.actor.getFlag("bitd-alternate-sheets", "notes");
    if (rawNotes) {
      sheetData.notes = await Utils.enrichNotes(this.actor, rawNotes);
    }
    return sheetData;
  }

  async _applyCrewInfo(sheetData) {
    const systemCrewEntries = this._getSystemCrewEntries();
    const primaryCrew = this._getPrimaryCrewEntry(systemCrewEntries);
    const crewActor = primaryCrew?.id
      ? game.actors?.get(primaryCrew.id)
      : null;
    const unknownCrewLabel = game.i18n.localize("bitd-alt.UnknownCrew");
    const crewName =
      crewActor?.name ?? primaryCrew?.name ?? unknownCrewLabel;
    const crewId = crewActor?.id ?? primaryCrew?.id ?? "";
    sheetData.crew = {
      id: crewId,
      name: crewName,
      hasLink: Boolean(crewId),
    };
  }

  async _applyAttributes(sheetData) {
    const computedAttributes = this.actor.getComputedAttributes();
    sheetData.system.attributes = computedAttributes;
    sheetData.attributes = computedAttributes;
    sheetData.system.stress.max = this.actor.getMaxStress();
    sheetData.system.trauma.max = this.actor.getMaxTrauma();
    if (sheetData.system?.healing_clock) {
      sheetData.system.healing_clock.value = this.actor.getHealingMin();
    }
    sheetData.acquaintances_label =
      sheetData.system.acquaintances_label == "BITD.Acquaintances"
        ? "bitd-alt.Acquaintances"
        : sheetData.system.acquaintances_label;

    let trauma_object = {};
    if (Array.isArray(sheetData.system.trauma.list)) {
      trauma_object = Utils.convertArrayToBooleanObject(
        sheetData.system.trauma.list
      );
      trauma_object = foundry.utils.expandObject({
        "system.trauma.list": trauma_object,
      });
      await this.actor.update(trauma_object);
    }
    const trauma_array = Utils.convertBooleanObjectToArray(
      sheetData.system.trauma.list
    );
    sheetData.trauma_array = trauma_array;
    sheetData.trauma_count = trauma_array.length;
  }

  async _applyDescriptions(sheetData) {
    sheetData.heritage =
      sheetData.system.heritage != "" && sheetData.system.heritage != "Heritage"
        ? sheetData.system.heritage
        : Utils.getOwnedObjectByType(this.actor, "heritage")
          ? Utils.getOwnedObjectByType(this.actor, "heritage").name
          : "";
    sheetData.background =
      sheetData.system.background != "" &&
        sheetData.system.background != "Background"
        ? sheetData.system.background
        : Utils.getOwnedObjectByType(this.actor, "background")
          ? Utils.getOwnedObjectByType(this.actor, "background").name
          : "";
    sheetData.vice =
      sheetData.system.vice != "" && sheetData.system.vice != "Vice"
        ? sheetData.system.vice
        : Utils.getOwnedObjectByType(this.actor, "vice")
          ? Utils.getOwnedObjectByType(this.actor, "vice").name
          : "";

    sheetData.heritage_description = await this._resolveDescription("heritage", sheetData.heritage);
    sheetData.background_description = await this._resolveDescription("background", sheetData.background);
    sheetData.vice_description = await this._resolveDescription("vice", sheetData.vice);

    const purveyorName = this.actor.getFlag(MODULE_ID, "vice_purveyor");
    sheetData.vice_purveyor_description = await this._resolveDescription("npc", purveyorName);
  }

  _applyLoadLevels(sheetData) {
    if (game.settings.get("blades-in-the-dark", "DeepCutLoad")) {
      sheetData.load_levels = {
        "BITD.Discreet": "BITD.Discreet",
        "BITD.Conspicuous": "BITD.Conspicuous",
        "BITD.Encumbered": "BITD.Encumbered",
      };
    } else {
      sheetData.load_levels = {
        "BITD.Light": "BITD.Light",
        "BITD.Normal": "BITD.Normal",
        "BITD.Heavy": "BITD.Heavy",
      };
    }
  }

  async _applyPlaybookAndAbilities(sheetData) {
    const owned_playbooks = this.actor.items.filter(
      (item) => item.type == "class"
    );
    if (owned_playbooks.length == 1) {
      sheetData.selected_playbook = owned_playbooks[0];
      const rawDesc = Utils.resolveDescription(owned_playbooks[0]);
      sheetData.selected_playbook_tooltip = Utils.strip(rawDesc);
    }

    const combined_abilities_list = await this._buildAbilityList(sheetData);
    this._applyAbilityProgress(sheetData, combined_abilities_list);
  }

  async _buildAbilityList(sheetData) {
    let combined_abilities_list = [];
    if (sheetData.selected_playbook) {
      combined_abilities_list = await Utils.getVirtualListOfItems(
        "ability",
        sheetData,
        true,
        sheetData.selected_playbook.name,
        false,
        true
      );
      sheetData.selected_playbook_full = sheetData.selected_playbook;
      sheetData.selected_playbook_full = await Utils.getItemByType(
        "class",
        sheetData.selected_playbook.id
      );
    } else {
      combined_abilities_list = await Utils.getVirtualListOfItems(
        "ability",
        sheetData,
        true,
        "",
        false,
        true
      );
    }
    return combined_abilities_list;
  }

  _applyAbilityProgress(sheetData, combined_abilities_list) {
    const abilityCostFor = (ability) => {
      const rawCost = ability?.system?.price ?? ability?.system?.cost ?? 1;
      const parsed = Number(rawCost);
      if (Number.isNaN(parsed) || parsed < 1) return 1;
      return Math.floor(parsed);
    };

    const storedAbilityProgress =
      foundry.utils.duplicate(
        this.actor.getFlag(MODULE_ID, "multiAbilityProgress") || {}
      ) || {};

    for (const ability of combined_abilities_list) {
      const cost = abilityCostFor(ability);
      const abilityKey = Utils.getAbilityProgressKey(ability);
      const storedProgress = Number(storedAbilityProgress[abilityKey]) || 0;
      const ownedAbilityId = this._findOwnedAbilityId(ability.name);
      const ownsAbility = Boolean(ownedAbilityId);

      let progress = Math.max(0, Math.min(storedProgress, cost));
      if (ownsAbility && progress < 1) {
        progress = 1;
      }

      ability._progress = progress;
      ability._progressKey = abilityKey;
      ability._ownedId = ownedAbilityId || "";
    }

    const filteredAbilities = this.showFilteredAbilities
      ? combined_abilities_list.filter((ab) => (Number(ab?._progress) || 0) > 0)
      : combined_abilities_list;

    sheetData.available_playbook_abilities = filteredAbilities;
    sheetData.my_abilities = sheetData.items.filter(
      (ability) => ability.type == "ability"
    );
  }

  async _applyItems(sheetData) {
    const genericDefaultsRaw = await Utils.getVirtualListOfItems(
      "item",
      sheetData,
      true,
      "",
      false,
      false
    );

    let armor = genericDefaultsRaw.findSplice((item) =>
      item.name.includes(game.i18n.localize("BITD.Armor"))
    );
    let heavy = genericDefaultsRaw.findSplice((item) =>
      item.name.includes(game.i18n.localize("BITD.Heavy"))
    );
    genericDefaultsRaw.sort((a, b) => {
      if (a.name === b.name) {
        return 0;
      }
      return Utils.trimClassFromName(a.name) > Utils.trimClassFromName(b.name)
        ? 1
        : -1;
    });

    if (armor) {
      genericDefaultsRaw.splice(0, 0, armor);
    }
    if (heavy) {
      genericDefaultsRaw.splice(1, 0, heavy);
    }

    const genericDefaults = genericDefaultsRaw.filter((def) => {
      const cls = (def.system?.class || def.system?.associated_class || "").trim();
      return !cls;
    }).map(d => {
      if (!d.system) d.system = {};
      d.system.virtual = true;
      d.owned = false;
      return d;
    });

    const genericOwned = this.actor.items.filter((i) => {
      const cls = (i.system?.class || i.system?.associated_class || "").trim();
      return i.type === "item" && !cls;
    }).map(i => {
      const data = i.toObject ? i.toObject() : foundry.utils.deepClone(i);
      data._id = i.id;
      if (!data.system) data.system = {};
      data.system.virtual = false;
      data.owned = true;
      return data;
    });

    sheetData.generic_items = [...genericDefaults, ...genericOwned];

    const currentPlaybookName = sheetData.selected_playbook ? sheetData.selected_playbook.name : "noclassselectod";
    const classedDefaultsRaw = await Utils.getVirtualListOfItems(
      "item",
      sheetData,
      true,
      currentPlaybookName,
      false,
      false
    );

    const classedDefaults = classedDefaultsRaw.map(d => {
      if (!d.system) d.system = {};
      d.system.virtual = true;
      d.owned = false;
      return d;
    });

    const classedOwned = this.actor.items.filter((i) => {
      const cls = (i.system?.class || i.system?.associated_class || "").trim();
      return i.type === "item" && !!cls;
    }).map(i => {
      const data = i.toObject ? i.toObject() : foundry.utils.deepClone(i);
      data._id = i.id;
      if (!data.system) data.system = {};
      data.system.virtual = false;
      data.owned = true;
      return data;
    });

    sheetData.my_items = [...classedDefaults, ...classedOwned];
  }

  async _applyLoad(sheetData) {
    let loadout = 0;
    const equipped = await this.actor.getFlag(
      "bitd-alternate-sheets",
      "equipped-items"
    );
    if (this.showFilteredItems) {
      const equippedMap = equipped || {};
      sheetData.my_items = (sheetData.my_items || []).filter((item) => {
        const key = item?.id || item?._id;
        return Boolean(key && equippedMap[key]);
      });
    }
    if (equipped) {
      for (const i of Object.values(equipped)) {
        if (!i) continue;
        loadout += parseInt(i.load) || 0;
      }
    }

    if (loadout < 0) {
      loadout = 0;
    }
    if (loadout > 10) {
      loadout = 10;
    }

    sheetData.loadout = loadout;

    if (game.settings.get('blades-in-the-dark', 'DeepCutLoad')) {
      switch (sheetData.system.selected_load_level) {
        case "BITD.Discreet":
          sheetData.max_load = sheetData.system.base_max_load + 4;
          break;
        case "BITD.Conspicuous":
          sheetData.max_load = sheetData.system.base_max_load + 6;
          break;
        case "BITD.Encumbered":
          sheetData.max_load = sheetData.system.base_max_load + 9;
          break;
        default:
          sheetData.system.selected_load_level = "BITD.Discreet";
          sheetData.max_load = sheetData.system.base_max_load + 4;
          break;
      }
    }
    else {
      switch (sheetData.system.selected_load_level) {
        case "BITD.Light":
          sheetData.max_load = sheetData.system.base_max_load + 3;
          break;
        case "BITD.Normal":
          sheetData.max_load = sheetData.system.base_max_load + 5;
          break;
        case "BITD.Heavy":
          sheetData.max_load = sheetData.system.base_max_load + 6;
          break;
        default:
          sheetData.system.selected_load_level = "BITD.Normal";
          sheetData.max_load = sheetData.system.base_max_load + 5;
          break;
      }
    }
  }

  _applyFilters(sheetData) {
    sheetData.showFilteredAbilities = this.showFilteredAbilities;
    sheetData.showFilteredItems = this.showFilteredItems;
    sheetData.showFilteredAcquaintances = this.showFilteredAcquaintances;
    sheetData.collapsedSections = this.collapsedSections;

    const acquaintanceList = Array.isArray(sheetData.system.acquaintances)
      ? sheetData.system.acquaintances
      : [];
    const filteredAcqs = this.showFilteredAcquaintances
      ? acquaintanceList.filter((acq) => {
        const standing = (acq?.standing ?? "").toString().trim().toLowerCase();
        return standing === "friend" || standing === "rival";
      })
      : acquaintanceList;
    sheetData.display_acquaintances = filteredAcqs;
  }

  async _resolveDescription(type, name) {
    if (!name || name.trim() === "") return "";

    // 1. Check Owned Items first (skip for NPC as they are not usually owned items in this context)
    if (type !== "npc") {
      const owned = this.actor.items.find(i => i.type === type && i.name === name);
      if (owned) return Utils.resolveDescription(owned);
    }

    // 2. Check World/Compendium
    const candidates = await Utils.getSourcedItemsByType(type);
    const match = candidates.find(i => i.name === name);
    return match ? Utils.resolveDescription(match) : "";
  }

  _ownsAbility(abilityName) {
    return Boolean(this._findOwnedAbilityId(abilityName));
  }

  _findOwnedAbilityId(abilityName) {
    if (!abilityName) return "";
    const trimmedTarget = Utils.trimClassFromName(abilityName);
    const owned = this.actor.items.find((item) => {
      if (item.type !== "ability") return false;
      if (item.name === abilityName) return true;
      const trimmedItem = Utils.trimClassFromName(item.name);
      return trimmedItem === trimmedTarget;
    });
    return owned?.id || "";
  }

  async _resetAbilityProgressFlags() {
    const existing = this.actor.getFlag(MODULE_ID, "multiAbilityProgress");
    if (!existing) return;
    await this.actor.unsetFlag(MODULE_ID, "multiAbilityProgress");
  }

  _resolveAbilityDeletionId(abilityBlock, fallbackId, abilityName) {
    const blockOwnedId = abilityBlock?.dataset?.abilityOwnedId;
    if (blockOwnedId && this.actor.items.get(blockOwnedId)) {
      return blockOwnedId;
    }

    const byNameId = this._findOwnedAbilityId(abilityName);
    if (byNameId && this.actor.items.get(byNameId)) {
      if (abilityBlock) abilityBlock.dataset.abilityOwnedId = byNameId;
      return byNameId;
    }

    if (fallbackId && this.actor.items.get(fallbackId)) {
      return fallbackId;
    }

    return "";
  }

  async clearLoad() {
    await this.actor.update({
      "flags.bitd-alternate-sheets.-=equipped-items": null,
    });
  }

  async openItemChooser(filterPlaybook, itemScope = "") {
    return openItemChooserHelper(this, filterPlaybook, itemScope);
  }

  async openPlaybookChooser() {
    const playbooks = await Utils.getSourcedItemsByType("class");
    const choices = playbooks.map((p) => ({
      value: p._id,
      label: p.name,
      img: p.img || "icons/svg/item-bag.svg",
      description: p.system?.description ?? "",
    }));

    const result = await openCardSelectionDialog({
      title: game.i18n.localize("bitd-alt.SelectPlaybookTitle"),
      instructions: game.i18n.localize("bitd-alt.SelectPlaybookInstructions"),
      okLabel: game.i18n.localize("bitd-alt.Select"),
      cancelLabel: game.i18n.localize("bitd-alt.Cancel"),
      clearLabel: game.i18n.localize("bitd-alt.Clear"),
      choices,
    });

    if (result === null) {
      await this._onPlaybookChange(null, true);
      return;
    }

    if (!result) return; // Cancelled

    const selected = playbooks.find((p) => p._id === result);
    if (!selected) return;

    await this._onPlaybookChange(selected);
  }

  async _onPlaybookChange(selected, isClear = false) {
    const existingPlaybook = this.actor.items.find((i) => i.type === "class");

    if (isClear) {
      if (existingPlaybook) {
        const confirm = await confirmDialog({
          title: game.i18n.localize("bitd-alt.SwitchPlaybook"),
          content: `<h4>${game.i18n.localize("bitd-alt.ClearPlaybookConfirmation")}</h4>`,
          defaultYes: false,
        });
        if (!confirm) return;

        await this.actor.deleteEmbeddedDocuments("Item", [existingPlaybook.id]);
        await this.switchPlaybook(null);
      }
      return;
    }

    if (!selected) return;

    if (existingPlaybook) {
      if (existingPlaybook.name === selected.name) return; // Same playbook

      const confirm = await confirmDialog({
        title: game.i18n.localize("bitd-alt.SwitchPlaybook"),
        content: `<h4>${game.i18n.localize("bitd-alt.SwitchPlaybookConfirmation")}</h4>`,
        defaultYes: false,
      });
      if (!confirm) return;

      await this.actor.deleteEmbeddedDocuments("Item", [existingPlaybook.id]);
    }

    // If it's a compendium item/virtual item, we need to create it
    if (!this.actor.items.has(selected.id)) {
      const itemData = {
        name: selected.name,
        type: "class",
        system: foundry.utils.deepClone(selected.system ?? {}),
        img: selected.img,
      };

      const created = await this.actor.createEmbeddedDocuments("Item", [itemData]);
      if (created && created[0]) {
        await this.switchPlaybook(created[0]);
      }
    } else {
      // It's already an owned item (maybe dragged from another actor or just re-applied)
      await this.switchPlaybook(selected);
    }
  }

  async openAcquaintanceChooser() {
    return openAcquaintanceChooserHelper(this);
  }

  addTermTooltips(html) {
    html
      .find(".hover-term")
      .hover(
        function (e) {
          // Hover event
          var titleText;
          if (e.target.title == "") {
            titleText = BladesLookup.getTerm($(this).text());
          } else {
            titleText = e.target.title;
          }
          $(this).data("tiptext", titleText).removeAttr("title");
          $('<p class="bitd-alt tooltip"></p>')
            .text(titleText)
            .appendTo("body")
            .css("top", e.pageY - 10 + "px")
            .css("left", e.pageX + 20 + "px")
            .fadeIn("fast");
        },
        function () {
          // Hover off event
          $(this).attr("title", $(this).data("tiptext"));
          $(".tooltip").remove();
        }
      )
      .mousemove(function (e) {
        // Mouse move event
        $(".tooltip")
          .css("top", e.pageY - 10 + "px")
          .css("left", e.pageX + 20 + "px");
      });
  }

  async showPlaybookChangeDialog(changed) {
    let modifications = await this.actor.modifiedFromPlaybookDefault(
      this.actor.system.playbook
    );
    return new Promise(async (resolve, reject) => {
      if (modifications) {
        let abilitiesToKeepOptions = {
          name: "abilities",
          value: "none",
          options: {
            all: "Keep all Abilities",
            custom: "Keep added abilities",
            owned: "Keep owned abilities",
            ghost: `Keep "Ghost" abilities`,
            none: "Replace all",
          },
        };
        let acquaintancesToKeepOptions = {
          name: "acquaintances",
          value: "none",
          options: {
            all: "All contacts",
            friendsrivals: "Keep only friends and rivals",
            custom: "Keep any added contacts",
            both: "Keep added contacts and friends/rivals",
            none: "Replace all",
          },
        };
        let keepSkillPointsOptions = {
          name: "skillpoints",
          value: "reset",
          options: {
            keep: "Keep current skill points",
            reset: "Reset to new playbook starting skill points",
          },
        };
        let playbookItemsToKeepOptions = {
          name: "playbookitems",
          value: "none",
          options: {
            all: "Keep all playbook items",
            custom: "Keep added items",
            none: "Replace all",
          },
        };
        let selectTemplate = Handlebars.compile(
          `<select name="{{name}}" class="pb-migrate-options">{{selectOptions options selected=value}}</select>`
        );
        let dialogContent = `
          <p>Changes have been made to this character that would be overwritten by a playbook switch. Please select how you'd like to handle this data and click "Ok", or click "Cancel" to cancel this change.</p>
          <p>Note that this process only uses the Item, Ability, Playbook, and NPC compendia to decide what is "default". If you have created entities outside the relevant compendia and added them to your character, those items will be considered "custom" and removed unless you choose to save.</p>
          <h2>Changes to keep</h2>
          <div ${modifications.newAbilities || modifications.ownedAbilities
            ? ""
            : "hidden"
          }>
            <label>Abilities to keep</label>
            ${selectTemplate(abilitiesToKeepOptions)}
          </div>
          <div ${modifications.addedItems ? "" : "hidden"}>
            <label>Playbook Items</label>
            ${selectTemplate(playbookItemsToKeepOptions)}
          </div>
          <div ${modifications.skillsChanged ? "" : "hidden"}>
            <label>Skill Points</label>
            ${selectTemplate(keepSkillPointsOptions)}
          </div>
          <div ${modifications.acquaintanceList || modifications.relationships
            ? ""
            : "hidden"
          }>
            <label>Acquaintances</label>
            ${selectTemplate(acquaintancesToKeepOptions)}
          </div>
        `;

        let pbConfirm = new Dialog({
          title: `Change playbook to ${await Utils.getPlaybookName(
            changed.system.playbook
          )}?`,
          content: dialogContent,
          buttons: {
            ok: {
              icon: '<i class="fas fa-check"></i>',
              label: "Ok",
              callback: async (html) => {
                let selects = html.find("select.pb-migrate-options");
                let selectedOptions = {};
                for (const select of $.makeArray(selects)) {
                  selectedOptions[select.name] = select.value;
                }
                resolve(selectedOptions);
              },
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: "Cancel",
              callback: () => {
                reject();
              },
            },
          },
          close: () => {
            reject();
          },
        });
        pbConfirm.render(true);
      } else {
        let selectedOptions = {
          abilities: "none",
          playbookitems: "none",
          skillpoints: "reset",
          acquaintances: "none",
        };
        resolve(selectedOptions);
      }
    });
  }

  async _onRadioToggle(event) {
    event.preventDefault();

    let type = event.target.tagName.toLowerCase();
    let target = event.target;
    if (type == "label") {
      let labelID = $(target).attr("for");
      target = document.getElementById(labelID);
    }

    if (!target) return;

    // Safety check: Ignore clock inputs (handled globally in hooks.js)
    if ($(target).closest('.blades-clock').length || $(event.currentTarget).closest('.blades-clock').length) {
      return;
    }

    const fieldName = target.name;
    const clickedValue = parseInt(target.value);

    // Get current value from actor data
    const currentValue = foundry.utils.getProperty(this.actor, fieldName) ?? 0;

    // Determine the new value based on visual state (red vs white)
    // Red teeth: values 1 through currentValue
    // White teeth: values greater than currentValue
    let newValue;
    if (clickedValue <= currentValue) {
      // Clicking a red tooth → decrement (set to one below clicked)
      newValue = clickedValue - 1;
    } else {
      // Clicking a white tooth → set to this value
      newValue = clickedValue;
    }

    // Optimistic UI update: find and check the correct input
    const targetInput = this.element.find(`input[name="${fieldName}"][value="${newValue}"]`);
    if (targetInput.length) {
      targetInput.prop("checked", true);
    }

    // Direct Foundry update
    await this.actor.update({ [fieldName]: newValue }, { render: false });
    this.render(false);
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Initialize Dockable Sections (2-column drag-and-drop)
    initDockableSections({
      root: html[0], // Pass the raw DOM element
      actorUuid: this.actor.uuid,
      namespace: "bitd-alternate-sheets",
      defaultLayout: {
        left: ["abilities"],
        right: ["items", "general-items", "acquaintances", "xp-notes"],
      },
    });

    this.addTermTooltips(html);

    Utils.bindFilterToggles(html, {
      abilities: () => {
        const next = !this.showFilteredAbilities;
        this.setLocalProp("showFilteredAbilities", next);
        Utils.saveUiState(this, { showFilteredAbilities: next });
      },
      items: () => {
        const next = !this.showFilteredItems;
        this.setLocalProp("showFilteredItems", next);
        Utils.saveUiState(this, { showFilteredItems: next });
      },
      acquaintances: () => {
        const next = !this.showFilteredAcquaintances;
        this.setLocalProp("showFilteredAcquaintances", next);
        Utils.saveUiState(this, { showFilteredAcquaintances: next });
      },
    });

    Utils.bindCollapseToggles(html, this);

    // Apply zebra striping for two-column layouts with column-first flow
    // CSS columns flow items down first column, then second, so we need JS to
    // determine which items are on the same visual row and apply consistent backgrounds
    html.find(".two-col-list").each((_, container) => {
      const items = container.querySelectorAll(".item-block");
      const totalItems = items.length;
      const itemsPerColumn = Math.ceil(totalItems / 2);

      items.forEach((item, index) => {
        // Determine which visual row this item is on
        // Items 0..itemsPerColumn-1 are in column 1
        // Items itemsPerColumn..totalItems-1 are in column 2
        const visualRow = index < itemsPerColumn
          ? index
          : index - itemsPerColumn;

        // Remove any existing zebra class
        item.classList.remove("zebra-even", "zebra-odd");

        // Add appropriate class based on visual row
        if (visualRow % 2 === 0) {
          item.classList.add("zebra-even");
        } else {
          item.classList.add("zebra-odd");
        }
      });
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    html.find('[data-action="chooser-add-item"]').off("click").on("click", (ev) => {
      ev.preventDefault();
      const filterPlaybook = ev.currentTarget?.dataset?.filterPlaybook;
      const itemScope = ev.currentTarget?.dataset?.itemScope;
      this.openItemChooser(filterPlaybook, itemScope);
    });

    html.find('[data-action="chooser-add-acquaintance"]').off("click").on("click", (ev) => {
      ev.preventDefault();
      this.openAcquaintanceChooser();
    });

    const ContextMenuClass =
      foundry?.applications?.ux?.ContextMenu?.implementation ?? ContextMenu;
    const contextMenuOptions = { jQuery: false };
    const root = html[0];

    new ContextMenuClass(root, ".item-block.owned", this.itemContextMenu, contextMenuOptions);
    new ContextMenuClass(root, ".context-items > span", this.itemListContextMenu, contextMenuOptions);
    new ContextMenuClass(root, ".context-abilities", this.abilityListContextMenu, contextMenuOptions);
    new ContextMenuClass(root, ".ability-add-popup", this.abilityListContextMenu, { ...contextMenuOptions, eventName: "click" });
    new ContextMenuClass(root, ".trauma-item", this.traumaListContextMenu, contextMenuOptions);
    new ContextMenuClass(root, ".acquaintance", this.acquaintanceContextMenu, contextMenuOptions);

    Utils.bindContenteditableSanitizers(html);

    html.on("click", "button.clearLoad", async (e) => {
      e.preventDefault();
      await this.clearLoad();
    });
    // NOTE: Clock controls are handled globally by setupGlobalClockHandlers() in hooks.js
    // We handle exclusion inside _onRadioToggle to prevent double-firing
    html.find("input.radio-toggle, label.radio-toggle")
      .off("click.radioToggle mousedown.radioToggle")
      .on("click.radioToggle", (e) => e.preventDefault())
      .on("mousedown.radioToggle", (e) => {
        this._onRadioToggle(e);
      });

    html.find(".inline-input").on("keyup", async (ev) => {
      let input = ev.currentTarget.previousSibling;
      const text = ev.currentTarget.innerText ?? "";
      input.value = text.trim().length === 0 ? "" : text;
    });

    html.find(".inline-input").on("blur", async (ev) => {
      let input = ev.currentTarget.previousSibling;
      const placeholder = ev.currentTarget.dataset.placeholder ?? "";
      const text = ev.currentTarget.innerText ?? "";
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        ev.currentTarget.innerText = placeholder;
        input.value = "";
      } else {
        input.value = text;
      }
      $(input).change();
    });

    html.find(".debug-toggle").click(async (ev) => {
      this.setLocalProp("show_debug", !this.show_debug);
      // html.find('.debug-toggle').toggleClass(on)
      // this.show_debug = true;
    });

    // Update Inventory Item
    html.find(".item-block .clickable-edit").click((ev) => {
      ev.preventDefault();
      let itemId = ev.currentTarget.closest(".item-block").dataset.itemId;
      let item = this.actor.items.get(itemId);
      if (item && !item.system.virtual) {
        item.sheet.render(true);
      }
    });

    html.find(".ability-block .clickable-edit").click((ev) => {
      ev.preventDefault();
      let abilityId =
        ev.currentTarget.closest(".ability-block").dataset.abilityId;
      let ability = this.actor.items.get(abilityId);
      ability.sheet.render(true);
    });

    // Handle Item/Load Toggling
    // Multi-cost items (e.g., Heavy with load 3) are treated as a single unit:
    // clicking ANY checkbox toggles ALL checkboxes for that item together.
    html.find(".item-checkbox").on("click change", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // If it's the change event, we just want to stop it from bubbling
      // The logic is handled by the click event
      if (ev.type === "change") return;

      const input = ev.currentTarget;
      const itemBlock = input.closest(".item-block");
      const itemId = itemBlock?.dataset?.itemId;

      if (!itemId) return;

      // Read itemLoad from the DOM element's data-load attribute
      // This works for both owned items AND virtual items (shown from compendium)
      const itemLoad = parseInt(itemBlock.dataset.load) || 0;

      // Replicate 'item-equipped' helper logic to determine current status
      const equippedItemsFlag = this.actor.getFlag("bitd-alternate-sheets", "equipped-items") || {};
      let isCurrentlyEquipped = false;

      if (Object.prototype.hasOwnProperty.call(equippedItemsFlag, itemId)) {
        isCurrentlyEquipped = !!equippedItemsFlag[itemId];
      } else {
        // Fallback checks
        const item = this.actor.items.get(itemId);
        if (itemLoad === 0) isCurrentlyEquipped = true;
        else isCurrentlyEquipped = !!item?.system?.equipped;
      }

      const desiredState = !isCurrentlyEquipped;

      // IDEMPOTENCY CHECK
      // If we have already optimistically toggled this item to the desired state in this render cycle,
      // ignore subsequent clicks (like the label ghost click caused by CSS overlap).
      // We store the pending state on the DOM element itself.
      if (itemBlock.dataset.optimisticState === String(desiredState)) {
        return;
      }
      itemBlock.dataset.optimisticState = String(desiredState);

      // OPTIMISTIC UPDATE
      // 1. Update all checkboxes for this item visually immediately
      // This satisfies the "Click one check all" requirement for multi-load items.
      // We use requestAnimationFrame to ensure our state setting happens AFTER
      // the browser's default click handling, which may have toggled the clicked checkbox.
      const allItemCheckboxes = itemBlock.querySelectorAll("input[type='checkbox']");
      requestAnimationFrame(() => {
        for (const cb of allItemCheckboxes) {
          cb.checked = desiredState;
        }
      });

      // 2. Update Load Stats
      if (itemLoad > 0) {
        const loadStatsEl = this.element.find(".load-stats");
        if (loadStatsEl.length) {
          const text = loadStatsEl.text(); // e.g., "3/5"
          const [currentLoadStr, maxLoadStr] = text.split("/");
          let currentLoad = parseInt(currentLoadStr) || 0;
          const maxLoad = parseInt(maxLoadStr) || 0;

          // Adjust load
          if (desiredState) {
            currentLoad += itemLoad;
          } else {
            currentLoad = Math.max(0, currentLoad - itemLoad);
          }

          // Update Text
          loadStatsEl.text(`${currentLoad}/${maxLoad}`);

          // Update Classes for Overburdened (visual only)
          const loadContainer = loadStatsEl.closest(".load-inline");
          const headerEl = loadStatsEl.closest("header.full-bar");
          if (currentLoad > maxLoad) {
            loadContainer.addClass("over-max");
            headerEl.addClass("over-max");
          } else {
            loadContainer.removeClass("over-max");
            headerEl.removeClass("over-max");
          }
        }
      }

      // 3. Persist to actor flags
      await Utils.toggleOwnership(desiredState, this.actor, "item", itemId);
    });

    // Delete Inventory Item -- not used in new design
    html.find(".delete-button").click(async (ev) => {
      const element = $(ev.currentTarget);
      const targetId = element.data("id");
      const targetType = element.data("type");

      if (targetType === "ability") {
        const abilityBlock = ev.currentTarget.closest(".ability-block");
        const abilityName = abilityBlock?.dataset?.abilityName || "";
        const deletionId = this._resolveAbilityDeletionId(
          abilityBlock,
          targetId,
          abilityName
        );
        if (!deletionId) return;
        await this.actor.deleteEmbeddedDocuments("Item", [deletionId], { render: false });
        if (abilityBlock) abilityBlock.dataset.abilityOwnedId = "";
      } else {
        if (!this.actor.items.get(targetId)) return;
        await this.actor.deleteEmbeddedDocuments("Item", [targetId], { render: false });
      }

      element.slideUp(200, () => this.render(false));
    });

    Utils.bindAllowEditToggle(this, html);

    html.find(".toggle-alias-display").click(async (event) => {
      event.preventDefault();
      this.actor.setFlag(
        "bitd-alternate-sheets",
        "showAliasInDirectory",
        !this.actor.getFlag("bitd-alternate-sheets", "showAliasInDirectory")
      );
    });

    const crewSelector = html.find('[data-action="select-crew"]');
    crewSelector.on("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.allow_edit) {
        await this._handleCrewFieldClick();
        return;
      }
      const crewId = event.currentTarget?.dataset?.crewId ?? "";
      await this._openCrewSheetById(crewId);
    });

    const playbookSelector = html.find('[data-action="select-playbook"]');
    playbookSelector.on("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.allow_edit) {
        await this.openPlaybookChooser();
        return;
      }
    });
    crewSelector.on("keydown", async (event) => {
      const triggerKeys = ["Enter", " ", "Space", "Spacebar"];
      if (!triggerKeys.includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.allow_edit) {
        await this._handleCrewFieldClick();
        return;
      }
      const crewId = event.currentTarget?.dataset?.crewId ?? "";
      await this._openCrewSheetById(crewId);
    });

    // Legacy .main-checkbox and .child-checkbox handlers removed.
    // Item toggling is now handled by the unified .item-checkbox handler above.

    html.find(".ability-checkbox").change(async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const checkboxEl = ev.currentTarget;
      const abilityBlock = checkboxEl.closest(".ability-block");
      if (!abilityBlock) return;

      const abilityId = abilityBlock.dataset.abilityId;
      const abilityName = abilityBlock.dataset.abilityName || "";
      const abilityCost = Number(abilityBlock.dataset.abilityCost) || 1;
      const abilityOwnedId = abilityBlock.dataset.abilityOwnedId || "";
      const abilityKey =
        abilityBlock.dataset.abilityKey ||
        Utils.getAbilityProgressKeyFromData(abilityName, abilityId);
      const checkboxList = Array.from(
        abilityBlock.querySelectorAll(".ability-checkbox")
      );

      const previousProgress =
        Number(abilityBlock.dataset.abilityProgress ?? 0) || 0;
      const slotValue = Number(checkboxEl.dataset.abilitySlot) || 1;

      let targetProgress;
      if (slotValue <= previousProgress) {
        targetProgress = slotValue - 1;
      } else {
        targetProgress = slotValue;
      }
      targetProgress = Math.max(0, Math.min(targetProgress, abilityCost));

      const hadProgress = previousProgress > 0;
      const willHaveProgress = targetProgress > 0;

      checkboxList.forEach((el) => el.setAttribute("disabled", "disabled"));

      try {
        await Profiler.time(
          "abilityToggle",
          async () => {
            if (!hadProgress && willHaveProgress) {
              await Utils.toggleOwnership(true, this.actor, "ability", abilityId);
            } else if (hadProgress && !willHaveProgress) {
              const targetId = abilityOwnedId || abilityId;
              await Utils.toggleOwnership(false, this.actor, "ability", targetId);
            }

            abilityBlock.dataset.abilityProgress = String(targetProgress);
            if (abilityKey) {
              await Utils.updateAbilityProgressFlag(
                this.actor,
                abilityKey,
                targetProgress
              );
            }

            checkboxList.forEach((el) => {
              const slot = Number(el.dataset.abilitySlot) || 1;
              const shouldCheck = slot <= targetProgress;
              el.checked = shouldCheck;
              if (shouldCheck) {
                el.setAttribute("checked", "checked");
              } else {
                el.removeAttribute("checked");
              }
            });

            const ownedIdAfterUpdate = this._findOwnedAbilityId(abilityName);
            abilityBlock.dataset.abilityOwnedId = ownedIdAfterUpdate || "";
          },
          {
            actorId: this.actor.id,
            abilityId,
            abilityName,
            targetProgress,
            hadProgress,
            willHaveProgress,
          }
        );
      } finally {
        checkboxList.forEach((el) => el.removeAttribute("disabled"));
      }
    });

    // Duplicate .main-checkbox change handler removed.
    // Item toggling is now handled by the unified .item-checkbox handler above.

    //this could probably be cleaner. Numbers instead of text would be fine, but not much easier, really.
    Utils.bindStandingToggles(this, html);

    $(document).click((ev) => {
      let render = false;
      if (!$(ev.target).closest(".coins-box").length) {
        html.find(".coins-box").removeClass("open");
        this.coins_open = false;
      }
      if (!$(ev.target).closest(".harm-box").length) {
        html.find(".harm-box").removeClass("open");
        this.harm_open = false;
      }
      if (!$(ev.target).closest(".load-box").length) {
        html.find(".load-box").removeClass("open");
        this.load_open = false;
      }
    });

    html.find(".coins-box").click(async (ev) => {
      if (!$(ev.target).closest(".coins-box .full-view").length) {
        html.find(".coins-box").toggleClass("open");
        this.coins_open = !this.coins_open;
      }
    });

    html.find(".harm-box").click((ev) => {
      if (!$(ev.target).closest(".harm-box .full-view").length) {
        html.find(".harm-box").toggleClass("open");
        this.harm_open = !this.harm_open;
      }
    });

    html.find(".load-box").click((ev) => {
      if (!$(ev.target).closest(".load-box .full-view").length) {
        html.find(".load-box").toggleClass("open");
        this.load_open = !this.load_open;
      }
    });

    html.find(".add_trauma").click(async (ev) => {
      // let data = await this.getData();
      let actorTraumaList = [];
      if (Array.isArray(this.actor.system.trauma.list)) {
        actorTraumaList = this.actor.system.trauma.list;
      } else {
        actorTraumaList = Utils.convertBooleanObjectToArray(
          this.actor.system.trauma.list
        );
      }
      let allTraumas = this.actor.system.trauma.options;
      let unownedTraumas = [];
      for (const traumaListKey of allTraumas) {
        if (!actorTraumaList.includes(traumaListKey)) {
          unownedTraumas.push(
            traumaListKey.charAt(0).toUpperCase() + traumaListKey.slice(1)
          );
        }
      }

      let unownedTraumasOptions = "";
      unownedTraumas.forEach((trauma) => {
        if (trauma.includes("BITD")) {
          unownedTraumasOptions += `<option value=${trauma}>${game.i18n.localize(
            trauma
          )}</option>`;
        } else {
          unownedTraumasOptions += `<option value=${trauma}>${game.i18n.localize(
            "BITD.Trauma" + trauma
          )}</option>`;
        }
      });
      let unownedTraumasSelect = `
        <select id="${this.actor.id}-trauma-select">
        ${unownedTraumasOptions}
        </select>
      `;
      let d = new Dialog({
        title: "Add Trauma",
        content: `Select a trauma to add:<br/>${unownedTraumasSelect}`,
        buttons: {
          add: {
            icon: "<i class='fas fa-plus'></i>",
            label: "Add",
            callback: async (html) => {
              let newTrauma = html
                .find(`#${this.actor.id}-trauma-select`)
                .val();
              newTrauma = newTrauma.replace("BITD.Trauma", "");
              newTrauma = newTrauma.toLowerCase();
              let newTraumaListValue = {
                system: {
                  trauma: this.actor.system.trauma,
                },
              };
              newTraumaListValue.system.trauma.list[newTrauma] = true;
              await this.actor.update(newTraumaListValue);
            },
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: "Cancel",
          },
        },
        render: (html) => { },
        close: (html) => { },
      });
      d.render(true);
    });

    // manage active effects
    html
      .find(".effect-control")
      .click((ev) => BladesActiveEffect.onManageActiveEffect(ev, this.actor));

    // super.activateListeners(html); // Removed duplicate
    // if (!this.options.editable) return; // Removed duplicate

    html.find('[data-action="smart-edit"]').click(this._handleSmartEdit.bind(this));
    html.find('[data-action="smart-item-selector"]').click((e) => Utils.handleSmartItemSelector(e, this.actor));

    html.find(".crew-name").click((event) => {
      const crewId = event.currentTarget.dataset.crewId;
      this._openCrewSheetById(crewId);
    });

    html.find(".toggle-expand").click((event) => {
      if (!this._element.hasClass("can-expand")) {
        this.setPosition({ height: 275 });
        this._element.addClass("can-expand");
      } else {
        this.setPosition({ height: "auto" });
        this._element.removeClass("can-expand");
      }
    });
  }

  _getSystemCrewEntries() {
    const crewData = foundry.utils.getProperty(this.actor, "system.crew");
    if (!Array.isArray(crewData)) return [];
    const duplicated = foundry.utils.duplicate(crewData);
    return duplicated.filter(
      (entry) => entry && typeof entry === "object"
    );
  }

  _getPrimaryCrewEntry(entries = this._getSystemCrewEntries()) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const withId = entries.find((entry) => entry?.id);
    return withId ?? entries[0] ?? null;
  }

  _getAvailableCrewActors() {
    if (!game?.actors) return [];
    return game.actors.filter((actor) => actor?.type === "crew");
  }

  /**
   * Handle Smart Edit (Text or Compendium Picker)
   * @param {Event} event
   */
  async _handleSmartEdit(event) {
    return handleSmartEdit(this, event);
  }

  async _handleCrewFieldClick() {
    const crewActors = this._getAvailableCrewActors();
    const primaryCrew = this._getPrimaryCrewEntry();
    const currentCrewId = primaryCrew?.id ?? "";
    const selectedCrewId = await this._promptCrewSelection(
      currentCrewId,
      crewActors
    );
    if (selectedCrewId === undefined) return;
    await this._updateCrewLink(selectedCrewId);
  }

  async _openCrewSheetById(crewId) {
    const normalized = crewId ? String(crewId).trim() : "";
    if (!normalized) return false;
    const crewActor = game.actors?.get(normalized);
    if (!crewActor) {
      const warning =
        game.i18n.localize("bitd-alt.CrewNotFound") ??
        "The selected crew could not be found.";
      ui.notifications?.warn?.(warning);
      return false;
    }
    if (crewActor.sheet) {
      crewActor.sheet.render(true);
      return true;
    }
    return false;
  }

  async _promptCrewSelection(currentCrewId, crewActors) {
    const instructions = game.i18n.localize(
      "bitd-alt.SelectCrewInstructions"
    );
    const title = game.i18n.localize("bitd-alt.SelectCrewTitle");
    const unknownCrew = game.i18n.localize("bitd-alt.UnknownCrew");
    const okLabel = game.i18n.localize("bitd-alt.Ok");
    const cancelLabel = game.i18n.localize("bitd-alt.Cancel");
    const clearLabel = game.i18n.localize("bitd-alt.ClearCrew");
    const crewLabel = game.i18n.localize("bitd-alt.CrewLabel");
    const clearHint = game.i18n.format("bitd-alt.CrewClearHint", {
      crew: unknownCrew,
    });
    const sortedCrew = [...crewActors].sort((a, b) =>
      (a?.name ?? "").localeCompare(b?.name ?? "", game.i18n.lang)
    );
    const choices = [
      { value: "", label: unknownCrew },
      ...sortedCrew.map((actor) => ({
        value: actor?.id ?? "",
        label: actor?.name ?? "",
        img: actor?.img ?? "icons/svg/mystery-man.svg",
      })),
    ];

    return await openCrewSelectionDialog({
      title,
      instructions,
      okLabel,
      cancelLabel,
      clearLabel,
      crewLabel,
      choices,
      currentValue: currentCrewId ?? "",
    });
  }

  async _updateCrewLink(selectedCrewId) {
    let normalized = selectedCrewId ? String(selectedCrewId).trim() : "";
    if (normalized === "null" || normalized === "undefined") normalized = "";

    const systemCrewEntries = this._getSystemCrewEntries();
    const currentPrimary = this._getPrimaryCrewEntry(systemCrewEntries);
    const currentCrewId = currentPrimary?.id ?? "";

    if (!normalized) {
      if (systemCrewEntries.length === 0) return;
      await this.actor.update({ system: { crew: [] } });
      return;
    }

    const crewActor = game.actors?.get(normalized);
    if (!crewActor) {
      const warning =
        game.i18n.localize("bitd-alt.CrewNotFound") ??
        "The selected crew could not be found.";
      ui.notifications?.warn?.(warning);
      return;
    }

    const description =
      foundry.utils.getProperty(crewActor, "system.description.value") ??
      foundry.utils.getProperty(crewActor, "system.description") ??
      "";
    const crewEntry = {
      id: crewActor.id,
      name: crewActor.name,
      description:
        typeof description === "string"
          ? description
          : foundry.utils.duplicate(description ?? ""),
      img: crewActor.img ?? "icons/svg/mystery-man.svg",
    };

    const nextCrewList = [
      crewEntry,
      ...systemCrewEntries.filter(
        (entry) => entry?.id && entry.id !== crewEntry.id
      ),
    ];

    const diff = foundry.utils.diffObject(systemCrewEntries, nextCrewList);
    const needsUpdate =
      currentCrewId !== crewEntry.id || !foundry.utils.isEmpty(diff);
    if (needsUpdate) {
      await this.actor.update({ system: { crew: nextCrewList } });
    }
  }

  /* -------------------------------------------- */

  async setPlaybookAttributes(newPlaybookItem) {
    let attributes = await Utils.getStartingAttributes(newPlaybookItem);
    let newAttributeData = { system: {} };
    newAttributeData.system.attributes = attributes;
    // this damned issue. For some reason exp and exp_max were getting grabbed as numbers instead of strings, which breaks the multiboxes helper somehow?
    Object.keys(newAttributeData.system.attributes).map((key, index) => {
      newAttributeData.system.attributes[key].exp =
        newAttributeData.system.attributes[key].exp.toString();
      newAttributeData.system.attributes[key].exp_max =
        newAttributeData.system.attributes[key].exp_max.toString();
    });
    queueUpdate(() => this.actor.update(newAttributeData));
  }
}
