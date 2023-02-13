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
        this.reader = new CodeReader(rawData);
        this.constantPool = new ConstantPool(this);
    }

    getClassName() {
        let cp = this.constantPool;
        return cp.getValue(cp.getValue(this.thisClass).nameIndex).string;
    }

    getFriendlyClassName(className) {
        let name = className || this.getClassName();
        name = name.replace(/\//g, '.');
        return name;
    }

    getSuperClassName() {
        let cp = this.constantPool;
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

    getConstantPool() {
        return this.constantPool;
    }

    getExternalClasses() {
        let cp = this.constantPool;
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
        this.magic = this.reader.readUInt().toString(16);
        this.version = {
            minorVersion: this.reader.readUShort(),
            majorVersion: this.reader.readUShort()
        };

        let constantPoolCount = this.reader.readUShort();
        for (let i = 1; i < constantPoolCount; i++) {
            let tag = this.reader.readByte();
            switch (tag) {
                case TAGS.CONSTANT_Class:
                    this.constantPool.addTag({ tag, nameIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Utf8:
                    let length = this.reader.readUShort();
                    let string = this.reader.readString(length);
                    this.constantPool.addTag({ tag, string });
                    break;
                case TAGS.CONSTANT_NameAndType:
                    this.constantPool.addTag({ tag, nameIndex: this.reader.readUShort(), signatureIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_String:
                    this.constantPool.addTag({ tag, stringIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Float:
                    this.constantPool.addTag({ tag, float: this.reader.readFloat() });
                    break;
                case TAGS.CONSTANT_Integer:
                    this.constantPool.addTag({ tag, integer: this.reader.readUInt() });
                    break;
                case TAGS.CONSTANT_Double:
                    this.constantPool.addTag({ tag, double: this.reader.readDouble() });
                    i++;
                    this.constantPool.addTag(null);
                    break;
                case TAGS.CONSTANT_Long:
                    this.constantPool.addTag({ tag, long: this.reader.readULong() });
                    i++;
                    this.constantPool.addTag(null);
                    break;
                case TAGS.CONSTANT_Fieldref:
                case TAGS.CONSTANT_Methodref:
                case TAGS.CONSTANT_InterfaceMethodref:
                    this.constantPool.addTag({ tag, classIndex: this.reader.readUShort(), nameAndTypeIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_MethodHandle:
                    this.constantPool.addTag({ tag, referenceIndex: this.reader.readByte(), referenceKind: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_MethodType:
                    this.constantPool.addTag({ tag, descriptorIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_InvokeDynamic:
                    this.constantPool.addTag({ tag, bootstrapMethodAttributeIndex: this.reader.readUShort(), nameAndTypeIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Module:
                    this.constantPool.addTag({ tag, moduleNameIndex: this.reader.readUShort() });
                    break;
                case TAGS.CONSTANT_Package:
                    this.constantPool.addTag({ tag, packageNameIndex: this.reader.readUShort() });
                    break;
                default:
                    // throw new Error(`tag ${tag} is not supported.`);
                    // return; 
            }
        }
        this.accessFlags = this.reader.readUShort();
        this.thisClass = this.reader.readUShort();
        this.superClass = this.reader.readUShort();
    }
}

module.exports = ConstantPoolReader;