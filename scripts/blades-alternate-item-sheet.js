// import { BladesActiveEffect } from "../../../systems/blades-in-the-dark/module/blades-active-effect.js";
import { Utils, MODULE_ID } from "./utils.js";
import { queueUpdate } from "./lib/update-queue.js";
import { getItemSheetClass } from "./compat.js";
import { guardDropAndHandle, setLocalPropAndRender, sheetDefaultOptions } from "./lib/sheet-helpers.js";

const BaseItemSheet = getItemSheetClass();

// import { migrateWorld } from "../../../systems/blades-in-the-dark/module/migration.js";

/**
 * Pure chaos
 * @extends {ItemSheet}
 */
export class BladesAlternateItemSheet extends BaseItemSheet {
  //  "description": ""
  //  {
  //   "activation": {
  //     "type": "",
  //     "cost": 0,
  //     "condition": ""
  //   },
  //   "duration": {
  //     "value": null,
  //     "units": ""
  //   },
  //   "target": {
  //     "value": null,
  //     "width": null,
  //     "units": "",
  //     "type": ""
  //   },
  //   "range": {
  //     "value": null,
  //     "long": null,
  //     "units": ""
  //   },
  //   "uses": {
  //     "value": 0,
  //     "max": 0,
  //     "per": null
  //   },
  //   "consume": {
  //     "type": "",
  //     "target": null,
  //     "amount": null
  //   }
  // }
  // "class": "",
  //   "load": 0,
  //   "uses": 1,
  //   "additional_info": "",
  //   "equipped" : false,
  //   "num_available": 1

  /** @override */
  static get defaultOptions() {
    return sheetDefaultOptions(super.defaultOptions, {
      classes: ["blades-alt", "sheet", "item"],
      template: "modules/bitd-alternate-sheets/templates/item-sheet.html",
      width: 400,
      height: 600,
    });
  }

  /** @override **/
  async _onDropItem(event, droppedItem) {
    await guardDropAndHandle(this, super._onDropItem.bind(this), event, droppedItem);
  }

  setLocalProp(propName, value) {
    setLocalPropAndRender(this, propName, value);
  }

  /** @override */
  async getData() {
    let data = await super.getData();
    return data;
  }
}
