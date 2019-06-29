const CLASS_ATTRIBUTES = require('./class_attributes');
const REF = CLASS_ATTRIBUTES.REF;
const TAG = CLASS_ATTRIBUTES.TAGS;

class ConstantPool {
    constructor(ca) {
        this.ca = ca;
        this.cp = [null];
    }

    get length () {
        return this.cp.length;
    }

    addTag(tagData) {
        this.cp.push(tagData)
    }

    getValue(idx) {
        if (idx < 0 || idx >= this.cp.length) {
            throw new ApplicationException('ConstantPool: Access outside of the boundaries');
        }
        return this.cp[idx];
    }

    resolve(idx){
        if (idx < 0 || idx >= this.cp.length) {
            throw new ApplicationException('ConstantPool: Access outside of the boundaries');
        }
        let base = this.cp[idx];
        let result = {tag: base.tag};
        let nameResolve = null;
        let signature = null;
    
        switch(base.tag){
            case TAG.CONSTANT_Class:
                result['tagName'] = 'Class';
                result['text'] = result['className'] = this.resolve(base.nameIndex).value;
                break;
            case TAG.CONSTANT_Fieldref:
                result['tagName'] = 'Fieldref';
                result['className'] = this.resolve(base.classIndex).className;
                nameResolve = this.resolve(base.nameAndTypeIndex);
                result['fieldName'] = nameResolve['name'];
                result['fieldType'] = nameResolve['type'];
                signature = this.ca.decodeSignature(result['fieldType']);
                result['text'] = `${signature.returnType} ${this.ca.getFriendlyClassName(result["className"])}.${result["fieldName"]}`;
                break;
            case TAG.CONSTANT_Methodref:
                result['tagName'] = 'Methodref';
                result['className'] = this.resolve(base.classIndex).className;
                nameResolve = this.resolve(base.nameAndTypeIndex);
                result['methodName'] = nameResolve['name'];
                result['methodType'] = nameResolve['type'];
                signature = this.ca.decodeSignature(result['methodType']);
                result['text'] = `${signature.returnType} ${this.ca.getFriendlyClassName(result["className"])}.${result["methodName"]}(${signature.parameterTypes ? signature.parameterTypes.join(', ') : ""})`;
                break;
            case TAG.CONSTANT_InterfaceMethodref:
                result['tagName'] = 'InterfaceMethodref';
                result['className'] = this.resolve(base.classIndex).className;
                nameResolve = this.resolve(base.nameAndTypeIndex);
                result['interfaeMethodName'] = nameResolve['name'];
                result['interfaeMethodType'] = nameResolve['type'];
                signature = this.ca.decodeSignature(result['interfaeMethodType']);
                result['text'] = `${signature.returnType} ${this.ca.getFriendlyClassName(result["className"])}.${result["interfaeMethodName"]}(${signature.parameterTypes ? signature.parameterTypes.join(', ') : ""})`;
                break;
            case TAG.CONSTANT_String:
                result['tagName'] = 'String';
                result['text'] = result['value'] = base.string;
                break;
            case TAG.CONSTANT_Integer:
                result['tagName'] = 'Integer';
                result['text'] = result['value'] = base.integer;
                break;
            case TAG.CONSTANT_Float:
                result['tagName'] = 'Float';
                result['text'] = result['value'] = base.float;
                break;
            case TAG.CONSTANT_Long:
                result['tagName'] = 'Long';
                result['text'] = result['value'] = base.long;  // long value stored in low and high halves
                break;
            case TAG.CONSTANT_Double:
                result['tagName'] = 'Double';
                result['text'] = result['value'] = base.double;
                break;
            case TAG.CONSTANT_NameAndType:
                result['tagName'] = 'NameAndType';
                result['name'] = this.resolve(base.nameIndex).value;
                result['type'] = this.resolve(base.signatureIndex).value;
                signature = this.ca.decodeSignature(result['type']);
                result['text'] = `${signature.returnType} ${result["name"]}(${signature.parameterTypes ? signature.parameterTypes.join(', ') : ""})`;
                break;
            case TAG.CONSTANT_Utf8:
                result['tagName'] = 'Utf8';
                result['text'] = result['value'] = base.string;
                break;
            case TAG.CONSTANT_MethodHandle:
                result['tagName'] = 'MethodHandle';
                result['kind'] = REF.toString(base.referenceKind);
                result['reference'] = this.resolve(base.referenceIndex);
                result['text'] = `Kind: ${result['kind']}, Reference: ${result['reference']}`;
                break;
            case TAG.CONSTANT_MethodType:
                result['tagName'] = 'MethodType';
                result['descriptor'] = this.resolve(base.referenceIndex).string;
                signature = this.ca.decodeSignature(result['descriptor']);
                result['text'] = signature.returnType + (signature.parameterTypes ? ' ' + signature.parameterTypes.join(', ') : '');
                break;
            case TAG.CONSTANT_InvokeDynamic:
                result['tagName'] = 'InvokeDynamic';
                result['bootstrapMethodIndex'] = base.bootstrapMethodAttributeIndex;
                nameResolve = this.resolve(base.nameAndTypeIndex);
                result['name'] = nameResolve['name'];
                result['type'] = nameResolve['type'];
                result['text'] = `bootstrap: ${result['bootstrapMethodIndex']} -> ${result['name']} -> ${result['type']}`;
                break;
            case TAG.CONSTANT_Module:
                result['tagName'] = 'Module';
                result['text'] = result['name'] = this.resolve(base.nameIndex).string;
                break;
            case TAG.CONSTANT_Package:
                result['tagName'] = 'Package';
                result['text'] = result['name'] = this.resolve(base.nameIndex).string;
                break;
    
        }
        return result;
    }
}

module.exports = ConstantPool;