import { BladesAlternateActorSheet } from "./blades-alternate-actor-sheet.js";
import { registerDiceSoNiceChanges } from "./dice-so-nice.js";
import { Patch } from "./patches.js";
import { Utils } from "./utils.js";

export async function registerHooks() {
  // Hooks.once('ready', () => {
  // if(!game.modules.get('lib-wrapper')?.active && game.user.isGM)
  //   ui.notifications.error("Module Blades in the Dark Alternate Sheets requires the 'libWrapper' module. Please install and activate it.");
  // });

  // Hooks.once("setup", () => {
  // });

  Hooks.on("renderSidebarTab", (app, html, options) => {
    if (options.tabName !== "actors") return;
    if (!game.user.isGM) return;

    Utils.replaceCharacterNamesInDirectory(app, html);
  });

  Hooks.once("ready", () => {
    Hooks.once("diceSoNiceReady", (dice3d) => {
      registerDiceSoNiceChanges(dice3d);
    });

    // Set up global event delegation for clock interactivity
    // This enables clocks to work in journals, chat, and other contexts
    setupGlobalClockHandlers();
  });

  // Bake clock state into chat messages at creation time to preserve historical values
  // This runs BEFORE the message is saved, so the snapshot is permanent
  Hooks.on("preCreateChatMessage", async (message, data, options, userId) => {
    let content = message.content || "";

    // Find @UUID references to actors
    const uuidPattern = /@UUID\[([^\]]+)\]\{([^}]*)\}/g;
    let match;
    let newContent = content;

    while ((match = uuidPattern.exec(content)) !== null) {
      try {
        const uuid = match[1];
        const doc = await fromUuid(uuid);

        if (!doc || (doc.type !== "🕛 clock" && doc.type !== "clock")) continue;

        // Capture current clock state
        const type = doc.system?.type ?? 4;
        const value = doc.system?.value ?? 0;
        const color = doc.system?.theme ?? "black";

        // Replace @UUID with a data-enriched version that includes the snapshot
        // We'll use a custom attribute to store the value at creation time
        const snapshotMarker = `@UUID[${uuid}]{${match[2]}|snapshot:${value}}`;
        newContent = newContent.replace(match[0], snapshotMarker);
      } catch (e) {
        // Ignore resolution errors
      }
    }

    if (newContent !== content) {
      message.updateSource({ content: newContent });
    }
  });

  // Post-process rendered content to replace clock actor links with clock visualizations
  // This runs AFTER Foundry's built-in @UUID enricher has created content-link elements
  Hooks.on("renderChatMessage", async (message, html, data) => {
    const container = html[0] || html;
    // Pass the message content to extract snapshot values
    if (container) await replaceClockLinks(container, message.content);
  });

  // Also process journals and other sheets that might contain clock links
  // V12 and earlier
  Hooks.on("renderJournalSheet", async (app, html, data) => {

    const container = html[0] || html;
    if (container) await replaceClockLinks(container);
  });

  Hooks.on("renderJournalPageSheet", async (app, html, data) => {

    const container = html[0] || html;
    if (container) await replaceClockLinks(container);
  });

  // V11+ uses JournalTextPageSheet for text pages
  Hooks.on("renderJournalTextPageSheet", async (app, html, data) => {

    const container = html[0] || html;
    if (container) await replaceClockLinks(container);
  });

  // V13+ uses ApplicationV2 - the hook name format is different
  // Generic hook for ALL ApplicationV2 renders
  // Note: Don't await to avoid blocking the render chain
  Hooks.on("renderApplicationV2", (app, html, data) => {
    // Check if this is a journal-related application
    const className = app.constructor.name;
    if (className.includes("Journal") || app.document?.documentName === "JournalEntry") {

      const container = html instanceof HTMLElement ? html : (html[0] || html);
      if (container) replaceClockLinks(container); // Fire and forget
    }
  });

  // V13+ DocumentSheetV2 for journal entries
  Hooks.on("renderDocumentSheetV2", (app, html, data) => {
    if (app.document?.documentName === "JournalEntry" || app.document?.documentName === "JournalEntryPage") {

      const container = html instanceof HTMLElement ? html : (html[0] || html);
      if (container) replaceClockLinks(container); // Fire and forget
    }
  });

  // Process actor sheets (for Notes tab)
  Hooks.on("renderActorSheet", async (app, html, data) => {
    const container = html[0] || html;
    if (container) await replaceClockLinks(container);
  });

  // Process crew sheets (for Notes tab)  
  Hooks.on("renderBladesCrewSheet", async (app, html, data) => {
    const container = html[0] || html;
    if (container) await replaceClockLinks(container);
  });
  //why isn't sheet showing up in update hook?

  Hooks.on("deleteItem", async (item, options, id) => {
    if (!item?.parent) return;
    const canModifyParent = item.isOwner || item.parent?.isOwner || game.user.isGM;
    if (!canModifyParent) return;

    if (item.type === "item") {
      await Utils.toggleOwnership(false, item.parent, "item", item.id);
    }
    if (item.type === "ability" && item.parent.type === "character") {
      const key = Utils.getAbilityProgressKeyFromData(item.name, item.id);
      await Utils.updateAbilityProgressFlag(item.parent, key, 0);
    }
  });

  Hooks.on("renderBladesClockSheet", async (sheet, html, options) => {
    let characters = game.actors.filter((a) => {
      return a.type === "character";
    });
    for (let index = 0; index < characters.length; index++) {
      const character = characters[index];
      if (!character?.isOwner) continue;
      if (!character.sheet?.rendered) continue;
      let notes = await character.getFlag("bitd-alternate-sheets", "notes");
      notes = notes ? notes : "";
      if (notes.includes(sheet.actor._id)) {
        character.sheet.render(false);
      }
    }
  });
  // should we just display items and abilities some other way so switching back and forth between sheets is easy?
  Hooks.on("updateActor", async (actor, updateData, options, actorId) => {
    if (
      options.diff &&
      updateData?.flags?.core &&
      "sheetClass" in updateData?.flags?.core
    ) {
    }
    if (actor._sheet instanceof BladesAlternateActorSheet) {
    }
  });

  Hooks.on("createActor", async (actor) => {
    if (actor._sheet instanceof BladesAlternateActorSheet) {
    }
  });
  return true;
}

/**
 * Find content-link elements pointing to clock actors and replace them with clock displays.
 * This runs after Foundry's built-in @UUID enricher has processed the text.
 * @param {HTMLElement} container - The container to search for clock links
 * @param {string} [messageContent] - Optional raw message content to extract snapshot values from
 */
async function replaceClockLinks(container, messageContent = null) {
  if (!container) return;

  // Parse snapshot values from message content if provided
  // Format: @UUID[Actor.xxx]{name|snapshot:value}
  const snapshotValues = new Map();
  if (messageContent) {
    const snapshotPattern = /@UUID\[([^\]]+)\]\{[^|]*\|snapshot:(\d+)\}/g;
    let match;
    while ((match = snapshotPattern.exec(messageContent)) !== null) {
      snapshotValues.set(match[1], parseInt(match[2]));
    }
  }

  // Find all content-link anchors that might be clock actors
  const links = container.querySelectorAll('a.content-link[data-type="Actor"]');

  for (const link of links) {
    const uuid = link.dataset.uuid;
    if (!uuid) continue;

    try {
      const doc = await fromUuid(uuid);
      if (!doc) continue;

      // Check if it's a clock actor
      if (doc.type !== "🕛 clock" && doc.type !== "clock") continue;

      // Generate clock HTML with full interactive structure
      const type = doc.system?.type ?? 4;
      // Use snapshot value if available, otherwise use current value
      const value = snapshotValues.has(uuid) ? snapshotValues.get(uuid) : (doc.system?.value ?? 0);
      const color = doc.system?.theme ?? "black";
      const uniq_id = doc.id;
      const renderInstance = foundry.utils.randomID();
      const parameter_name = `system.value-${uniq_id}-${renderInstance}`;

      const clockDiv = document.createElement("div");
      clockDiv.className = "blades-clock-container linkedClock";
      clockDiv.dataset.uuid = uuid;
      // Mark if this is a historical snapshot (non-interactive in chat)
      if (snapshotValues.has(uuid)) {
        clockDiv.dataset.snapshot = "true";
      }

      // Build HTML with radio inputs and labels for segment clicking
      let clockHtml = `<div id="blades-clock-${uniq_id}-${renderInstance}" 
           class="blades-clock clock-${type} clock-${type}-${value}" 
           style="background-image:url('systems/blades-in-the-dark/themes/${color}/${type}clock_${value}.svg'); width: 100px; height: 100px;"
           data-uuid="${uuid}">`;

      // Zero input (hidden)
      const zero_checked = (parseInt(value) === 0) ? 'checked' : '';
      clockHtml += `<input type="radio" value="0" id="clock-0-${uniq_id}-${renderInstance}" data-dType="String" name="${parameter_name}" ${zero_checked}>`;

      // Segment inputs and labels
      for (let i = 1; i <= parseInt(type); i++) {
        const checked = (parseInt(value) === i) ? 'checked' : '';
        clockHtml += `<input type="radio" value="${i}" id="clock-${i}-${uniq_id}-${renderInstance}" data-dType="String" name="${parameter_name}" ${checked}>`;
        clockHtml += `<label class="radio-toggle" for="clock-${i}-${uniq_id}-${renderInstance}"></label>`;
      }

      clockHtml += `</div>`;
      clockHtml += `<br/><span class="clock-name">${doc.name}</span>`;

      clockDiv.innerHTML = clockHtml;

      // Replace the link with the clock
      link.replaceWith(clockDiv);

    } catch (e) {
      console.warn("[BITD-ALT] Error processing clock link:", e);
    }
  }
}

/**
 * Set up global event handlers for clock interactivity.
 * Uses event delegation on document.body to handle clocks everywhere.
 * 
 * This is the SINGLE SOURCE OF TRUTH for clock interactions.
 * 
 * How it works:
 * - Reads update path from the radio input's `name` attribute (e.g., "system.healing_clock.value")
 * - Gets document UUID from data-uuid on the clock or parent form
 * - Performs optimistic UI update immediately
 * - Saves to database in background with render: false
 */
function setupGlobalClockHandlers() {
  const $body = $(document.body);

  /**
   * Shared helper to perform optimistic UI update on a clock element
   */
  function optimisticUpdate(clockEl, newValue) {
    // Parse current state from background-image URL
    const bg = clockEl.style.backgroundImage || "";
    const urlMatch = bg.match(/url\(['"]?(.*?)['"]?\)/);
    if (!urlMatch) return null;

    const currentSrc = urlMatch[1];

    // Match patterns like "4clock_2.svg" or "4-2.svg"
    const clockMatch = currentSrc.match(/(\d+)clock_(\d+)\./) || currentSrc.match(/(\d+)-(\d+)\./);
    if (!clockMatch) return null;

    const type = parseInt(clockMatch[1]);
    const currentValue = parseInt(clockMatch[2]);

    // Extract color/theme from path
    const themeMatch = currentSrc.match(/themes\/([^/]+)\//);
    const color = themeMatch ? themeMatch[1] : "black";

    // Build new URL
    const newSrc = currentSrc.replace(
      new RegExp(`${type}clock_${currentValue}\\.`),
      `${type}clock_${newValue}.`
    ).replace(
      new RegExp(`${type}-${currentValue}\\.`),
      `${type}-${newValue}.`
    );

    // Apply optimistic visual update
    clockEl.style.backgroundImage = `url('${newSrc}')`;
    clockEl.className = clockEl.className.replace(/clock-\d+-\d+/, `clock-${type}-${newValue}`);

    // Update radio button states
    const inputs = clockEl.querySelectorAll('input[type="radio"]');
    inputs.forEach(inp => inp.checked = parseInt(inp.value) === newValue);

    return { type, currentValue, color };
  }

  /**
   * Get the update path from a radio input's name attribute.
   * The name is set by the Handlebars helper, e.g., "system.healing_clock.value"
   * For dynamically generated clocks, we strip the unique suffix.
   */
  function getUpdatePath(input) {
    let name = input.name || "";
    // Strip render-instance suffixes (e.g., "system.value-abc123-xyz789" → "system.value")
    name = name.replace(/-[a-zA-Z0-9]+-[a-zA-Z0-9]+$/, "");
    return name || "system.value";
  }

  /**
   * Get the document UUID for a clock element.
   * Checks data-uuid on the element, then parent containers, then form.
   */
  function getDocumentUuid(clockEl) {
    return clockEl.dataset.uuid
      || clockEl.closest('[data-uuid]')?.dataset.uuid
      || clockEl.closest('form')?.dataset.uuid;
  }

  // Handle label clicks on clocks (segment selection with toggle behavior)
  $body.on("click", ".blades-clock label.radio-toggle", async (e) => {
    // Skip if this is a snapshot (historical chat clock)
    if ($(e.currentTarget).closest('[data-snapshot="true"]').length) return;

    e.preventDefault();
    e.stopPropagation();

    const label = e.currentTarget;
    const forId = label.getAttribute("for");
    if (!forId) return;

    const input = document.getElementById(forId);
    if (!input || input.type !== "radio") return;

    const clockEl = label.closest('.blades-clock');
    if (!clockEl) return;

    const clickedSegment = parseInt(input.value);
    const updatePath = getUpdatePath(input);
    const uuid = getDocumentUuid(clockEl);

    if (!uuid) {
      console.warn("[BITD-ALT] Clock has no UUID, cannot save");
      return;
    }

    // Get current value from checked radio
    const checkedInput = clockEl.querySelector('input[type="radio"]:checked');
    const currentValue = checkedInput ? parseInt(checkedInput.value) : 0;

    // Toggle behavior:
    // - If clicking on a segment that's already filled (clickedSegment <= currentValue),
    //   toggle it OFF by setting value to (clickedSegment - 1)
    // - If clicking on an unfilled segment, fill TO that segment
    let newValue;
    if (clickedSegment <= currentValue) {
      // Clicking on filled segment - toggle off (clear this segment and all clockwise)
      newValue = clickedSegment - 1;
    } else {
      // Clicking on unfilled segment - fill to this segment
      newValue = clickedSegment;
    }

    // Check the appropriate radio and update UI
    const targetInput = clockEl.querySelector(`input[type="radio"][value="${newValue}"]`);
    if (targetInput) targetInput.checked = true;

    // Optimistic UI update
    optimisticUpdate(clockEl, newValue);

    // Background save
    try {
      const doc = await fromUuid(uuid);
      if (doc) {
        await doc.update({ [updatePath]: newValue }, { render: false });
      }
    } catch (err) {
      console.warn("[BITD-ALT] Error saving clock:", err);
    }
  });

  // Handle right-click to decrement
  $body.on("contextmenu", ".blades-clock", async (e) => {
    // Skip if this is a snapshot (historical chat clock)
    if ($(e.currentTarget).closest('[data-snapshot="true"]').length) return;

    e.preventDefault();

    const clockEl = e.currentTarget;
    const uuid = getDocumentUuid(clockEl);

    if (!uuid) {
      console.warn("[BITD-ALT] Clock has no UUID, cannot save");
      return;
    }

    // Get current value from the checked radio
    const checkedInput = clockEl.querySelector('input[type="radio"]:checked');
    const currentValue = checkedInput ? parseInt(checkedInput.value) : 0;
    const newValue = Math.max(0, currentValue - 1);

    if (newValue === currentValue) return;

    // Get update path from any radio input
    const anyInput = clockEl.querySelector('input[type="radio"]');
    const updatePath = anyInput ? getUpdatePath(anyInput) : "system.value";

    // Optimistic UI update
    optimisticUpdate(clockEl, newValue);

    // Background save
    try {
      const doc = await fromUuid(uuid);
      if (doc) {
        await doc.update({ [updatePath]: newValue }, { render: false });
      }
    } catch (err) {
      console.warn("[BITD-ALT] Error saving clock:", err);
    }
  });

  console.log("[BITD-ALT] Global clock handlers initialized");
}
