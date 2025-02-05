const CodeReader = require('./code_reader');
const ConstantPool = require('./constant_pool');
const CLASS_ATTRIBUTES = require('./class_attributes');
const TAGS = CLASS_ATTRIBUTES.TAGS;
const ACCESS_FLAGS = CLASS_ATTRIBUTES.ACCESS_FLAGS;
const ATTRIBUTE_TYPES = CLASS_ATTRIBUTES.ATTRIBUTE_TYPES;

function includes (array, element) {
    return array.indexOf(element) > -1;
}

class ConstantPoolReader {

    constructor(rawData) {
        this._reader = new CodeReader(rawData);
        this._constantPool = new ConstantPool(this);
    }

    get className() {
        let cp = this._constantPool;
        return cp.getValue(cp.getValue(this.thisClass).nameIndex).string;
    }

    get friendlyClassName() {
        let name = this.className;
        name = name.replace(/\//g, '.');
        return name;
    }

    get superClassName() {
        let cp = this._constantPool;
        let nameIndexValue = cp.getValue(this.superClass);
        if (!nameIndexValue) {
            return null;
        }
        let nameIndex = nameIndexValue.nameIndex;
        if (!nameIndex) {
            return null;
        }
        
        return cp.getValue(nameIndex).string;
    }

    get constantPool() {
        return this._constantPool;
    }

    get externalClasses() {
        let cp = this._constantPool;
        let results = [];

        for (let idx = 1; idx < cp.length; idx++) {
            let cp_entry = cp.getValue(idx);

            if (!cp_entry) { // Long and double have double constant pool entries
                continue;
            }

            if (cp_entry.tag == TAGS.CONSTANT_Class && idx != this.thisClass) {
                results.push(cp.resolve(idx).text);
            }
        }

        return results;
    }

    read() {
        this.magic = this._reader.readUInt().toString(16);
        this.version = {
            minorVersion: this._reader.readUShort(),
            majorVersion: this._reader.readUShort()
        };

        let constantPoolCount = this._reader.readUShort();
        for (let i = 1; i < constantPoolCount; i++) {
            let tag = this._reader.readByte();
            switch (tag) {
                case TAGS.CONSTANT_Class:
                    this._constantPool.addTag({ tag, nameIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Utf8:
                    let length = this._reader.readUShort();
                    let string = this._reader.readString(length);
                    this._constantPool.addTag({ tag, string });
                    break;
                case TAGS.CONSTANT_NameAndType:
                    this._constantPool.addTag({ tag, nameIndex: this._reader.readUShort(), signatureIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_String:
                    this._constantPool.addTag({ tag, stringIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Float:
                    this._constantPool.addTag({ tag, float: this._reader.readFloat() });
                    break;
                case TAGS.CONSTANT_Integer:
                    this._constantPool.addTag({ tag, integer: this._reader.readUInt() });
                    break;
                case TAGS.CONSTANT_Double:
                    this._constantPool.addTag({ tag, double: this._reader.readDouble() });
                    i++;
                    this._constantPool.addTag(null);
                    break;
                case TAGS.CONSTANT_Long:
                    this._constantPool.addTag({ tag, long: this._reader.readULong() });
                    i++;
                    this._constantPool.addTag(null);
                    break;
                case TAGS.CONSTANT_Fieldref:
                case TAGS.CONSTANT_Methodref:
                case TAGS.CONSTANT_InterfaceMethodref:
                    this._constantPool.addTag({ tag, classIndex: this._reader.readUShort(), nameAndTypeIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_MethodHandle:
                    this._constantPool.addTag({ tag, referenceIndex: this._reader.readByte(), referenceKind: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_MethodType:
                    this._constantPool.addTag({ tag, descriptorIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_InvokeDynamic:
                    this._constantPool.addTag({ tag, bootstrapMethodAttributeIndex: this._reader.readUShort(), nameAndTypeIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Module:
                    this._constantPool.addTag({ tag, moduleNameIndex: this._reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Package:
                    this._constantPool.addTag({ tag, packageNameIndex: this._reader.readUShort() });
                    break;
                default:
                    // throw new Error(`tag ${tag} is not supported.`);
                    // return; 
            }
        }
        this.accessFlags = this._reader.readUShort();
        this.thisClass = this._reader.readUShort();
        this.superClass = this._reader.readUShort();
    }
}

module.exports = ConstantPoolReader;