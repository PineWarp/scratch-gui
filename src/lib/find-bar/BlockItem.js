export default class BlockItem {
    constructor (cls, procCode, labelID, y, opcode = null) {
        this.cls = cls;
        this.procCode = procCode;
        this.labelID = labelID;
        this.y = y;
        this.lower = procCode.toLowerCase();
        this.opcode = opcode;
        this.opcodeSearch = opcode ? opcode.toLowerCase() : null;
        /**
         * An Array of block ids
         * @type {Array.<string>}
         */
        this.clones = null;
        this.eventName = null;
        /**
         * Field values straight from the VM, set for blocks the workspace has not rendered. They
         * are what lets a row still be drawn as a real block instead of falling back to text.
         * @type {?object}
         */
        this.vmFields = null;
        /**
         * The name of the variable or list this entry stands for, if it stands for one.
         * @type {?string}
         */
        this.variableName = null;
    }

    /**
     * True if the blockID matches a block represented by this BlockItem
     * @param {string} id - Block id to match
     * @returns {boolean} True if the id matches
     */
    matchesID (id) {
        if (this.labelID === id) {
            return true;
        }
        if (this.clones) {
            for (const cloneID of this.clones) {
                if (cloneID === id) {
                    return true;
                }
            }
        }
        return false;
    }
}
