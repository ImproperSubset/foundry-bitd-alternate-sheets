/**
 * Small helpers shared by item/class sheets to reduce duplication.
 */
export function sheetDefaultOptions(baseOptions, { classes = [], template, width, height } = {}) {
  return foundry.utils.mergeObject(baseOptions, {
    classes,
    template,
    width,
    height,
  });
}

const NOTIFY_PERMS =
  "You do not have sufficient permissions to edit this character. Please speak to your GM if you feel you have reached this message in error.";

export async function guardDropAndHandle(sheet, superDropFn, event, droppedItem) {
  await superDropFn(event, droppedItem);
  if (!sheet.actor?.isOwner) {
    ui.notifications.error(NOTIFY_PERMS, { permanent: true });
    return false;
  }
  return sheet.handleDrop(event, droppedItem);
}

export function setLocalPropAndRender(sheet, propName, value) {
  sheet[propName] = value;
  sheet.render(false);
}
