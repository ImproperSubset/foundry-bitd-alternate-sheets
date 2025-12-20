export async function getAllItemsByType(item_type) {
  let list_of_items = [];
  let world_items = [];
  let compendium_items = [];

  if (item_type === "npc") {
    world_items = game.actors
      .filter((e) => e.type === item_type)
      .map((e) => {
        return e;
      });
  } else {
    world_items = game.items
      .filter((e) => e.type === item_type)
      .map((e) => {
        return e;
      });
  }

  const packName = item_type === "npc" ? "npcs" : item_type;
  let pack = game.packs.get("blades-in-the-dark." + packName) ||
    game.packs.get("blades-in-the-dark." + item_type) ||
    game.packs.find((e) => e.metadata.name === packName) ||
    game.packs.find((e) => e.metadata.name === item_type);

  if (pack && typeof pack.getDocuments === "function") {
    let compendium_content = await pack.getDocuments();
    compendium_items = compendium_content.map((e) => {
      return e;
    });
  }

  list_of_items = world_items.concat(compendium_items);
  list_of_items.sort(function (a, b) {
    let nameA = a.name.toUpperCase();
    let nameB = b.name.toUpperCase();
    return nameA.localeCompare(nameB);
  });
  return list_of_items;
}

export async function getSourcedItemsByType(item_type) {
  const populateFromCompendia = game.settings.get(
    "bitd-alternate-sheets",
    "populateFromCompendia"
  );
  const populateFromWorld = game.settings.get(
    "bitd-alternate-sheets",
    "populateFromWorld"
  );
  const searchAllPacks = game.settings.get("bitd-alternate-sheets", "searchAllPacks");
  let limited_items = [];

  if (populateFromWorld) {
    if (item_type === "npc") {
      limited_items = limited_items.concat(game.actors.filter((actor) => actor.type === item_type));
    } else {
      limited_items = limited_items.concat(game.items.filter((item) => item.type === item_type));
    }
  }

  if (populateFromCompendia) {
    if (searchAllPacks) {
      const targetDocName = item_type === "npc" ? "Actor" : "Item";
      for (const pack of game.packs) {
        if (pack.documentName !== targetDocName) continue;
        const docs = await pack.getDocuments();
        const matches = docs.filter(d => d.type === item_type);
        limited_items = limited_items.concat(matches);
      }

    } else {
      const packName = item_type === "npc" ? "npcs" : item_type;
      const pack = game.packs.get("blades-in-the-dark." + packName) ||
        game.packs.get("blades-in-the-dark." + item_type) ||
        game.packs.find((e) => e.metadata.name === packName && e.metadata.packageName === "blades-in-the-dark") ||
        game.packs.find((e) => e.metadata.name === item_type && e.metadata.packageName === "blades-in-the-dark");

      if (pack) {
        const docs = await pack.getDocuments();
        limited_items = limited_items.concat(docs);
      }
    }
  }

  if (!populateFromCompendia && !populateFromWorld) {
    ui.notifications.error(
      `No playbook auto-population source has been selected in the system settings. Please choose at least one source.`,
      { permanent: true }
    );
  }
  if (limited_items) {
    limited_items.sort(function (a, b) {
      let nameA = a.name.toUpperCase();
      let nameB = b.name.toUpperCase();
      return nameA.localeCompare(nameB);
    });
  }

  return limited_items;
}

export async function getFilteredActors(type, filterPath, filterValue) {
  const rawList = await getSourcedItemsByType(type);

  const filtered = rawList.filter((a) => {
    const val = foundry.utils.getProperty(a, filterPath ?? "");
    return val === filterValue;
  });

  return filtered.map((actor) => ({
    _id: actor._id || actor.id,
    name: actor.name,
    img: actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg",
    type: actor.type,
    system: {
      description: resolveDescription(actor),
      associated_crew_type: actor.system.associated_crew_type || actor.system.recruit_type || "",
    },
  }));
}

function resolveDescription(entity) {
  if (!entity) return "";
  const system = entity.system || {};
  return (
    system.description_short ||
    system.description ||
    system.notes ||
    system.biography ||
    ""
  );
}
