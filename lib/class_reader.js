const CodeReader = require('./code_reader');
const ConstantPool = require('./constant_pool');
const CLASS_ATTRIBUTES = require('./class_attributes');
const TAGS = CLASS_ATTRIBUTES.TAGS;
const ACCESS_FLAGS = CLASS_ATTRIBUTES.ACCESS_FLAGS;
const ATTRIBUTE_TYPES = CLASS_ATTRIBUTES.ATTRIBUTE_TYPES;

class ClassReader {

    constructor(rawData) {
        this._reader = new CodeReader(rawData);
        this._constantPool = new ConstantPool(this);
    }

    get className() {
        let cp = this._constantPool;
        return cp.getValue(cp.getValue(this.thisClass).nameIndex).string;
    }

    get friendlyClassName() {
        return this.getFriendlyClassName(this.className);
    }

    getFriendlyClassName(name) {
        name = name.replace(/\//g, '.');
        return name;
    }


    get superClassName() {
        let cp = this._constantPool;
        return cp.getValue(cp.getValue(this.superClass).nameIndex).string;
    }

    get accessFlags() {
        return this.decodeAccessFlags(this._accessFlags);
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

    get fields() {
        return this._fields;
    }

    get methods() {
        return this._methods;
    }

    get classes() {
        let self = this;
        let classes = [];
        let cp = self._constantPool;
        for (let attr of this.attributes) {
            if (attr.info.type === ATTRIBUTE_TYPES.InnerClasses) {
                for (let classObject of attr.info.classes) {
                    try {
                        if (classObject.innerClassInfoIndex > 0) {
                            classes.push(cp.getValue(cp.getValue(classObject.innerClassInfoIndex).nameIndex).string);
                        }
                        if(classObject.outerClassInfoIndex > 0) {
                            classes.push(cp.getValue(cp.getValue(classObject.outerClassInfoIndex).nameIndex).string);
                        }
                    } catch (ex) {
                        console.error(ex);
                    }
                }
            }
        }
        return classes;
    }

    decodeDescriptorType(descriptor) {
        let signature = '';
        switch (descriptor[0]) {
            case 'B':
                signature = 'byte';
                break;
            case 'C':
                signature = 'char';
                break;
            case 'D':
                signature = 'double';
                break;
            case 'F':
                signature = 'float';
                break;
            case 'I':
                signature = 'int';
                break;
            case 'J':
                signature = 'long';
                break;
            case 'L':
                signature = 'class';
                break;
            case 'S':
                signature = 'short';
                break;
            case 'V':
                signature = 'void';
                break;
            case 'Z':
                signature = 'boolean';
                break;
            case '[':
                signature = 'array';
                break;
            default:
                throw new Error(`Unknown type [${descriptor[0]} in ${descriptor}]`);
        }

        return signature;
    }

    decodeAccessFlags(accessFlags) {
        let result = '';

        if (accessFlags & ACCESS_FLAGS.ACC_PUBLIC) {
            result += 'public ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_PRIVATE) {
            result += 'private ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_PROTECTED) {
            result += 'protected ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_STATIC) {
            result += 'static ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_FINAL) {
            result += 'final ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_SYNCHRONIZED) {
            result += 'synchronized ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_VOLATILE) {
            result += 'volatile ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_TRANSIENT) {
            result += 'transient ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_NATIVE) {
            result += 'native ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_INTERFACE) {
            result += 'interface ';
        }
        if (accessFlags & ACCESS_FLAGS.ACC_ABSTRACT) {
            result += 'abstract ';
        }

        return result;
    }

    decodeSignatureComponent(descriptor, pos) {
        let result = '';
        switch (descriptor[pos.currentPos]) {
            case 'B':
                result = 'byte';
                break;
            case 'C':
                result = 'char';
                break;
            case 'D':
                result = 'double';
                break;
            case 'F':
                result = 'float';
                break;
            case 'I':
                result = 'int';
                break;
            case 'J':
                result = 'long';
                break;
            case 'L':
            {
                // TODO: Properly decode generics like Lclass1<Lclass2;>;
                let endPos = descriptor.indexOf(';', pos.currentPos);
                endPos = endPos == -1 ? descriptor.length : endPos;
                result = descriptor.substring(pos.currentPos + 1, endPos).replace(/\//g,'.');
                pos.newPos = endPos;
                break;
            }
            case 'T':
            {
                // TODO: Properly decode generics like Tclass1<Tclass2;>;
                let endPos = descriptor.indexOf(';', pos.currentPos);
                endPos = endPos == -1 ? descriptor.length : endPos;
                result = descriptor.substring(pos.currentPos + 1, endPos).replace(/\//g,'.');
                pos.newPos = endPos;
                break;
            }
            case 'S':
                result = 'short';
                break;
            case 'V':
                result = 'void';
                break;
            case 'Z':
                result = 'boolean';
                break;
            case '[':
                pos.currentPos++;
                result = `${this.decodeSignatureComponent(descriptor, pos)}[]`;
                break;
            default:
                result = `[Unknown type '${descriptor[pos.currentPos]}']`;
        }
        return result;
    }

    decodeSignature(descriptor) {
        let result = {returnType: '', parameterTypes: []};
        let returnType = [];
        let parameterTypes = [];
        let resultArray = returnType;

        if (!descriptor || descriptor.length == 0) {
            return result;
        }

        for (let pos = 0; pos < descriptor.length; pos++) {
            switch (descriptor[pos]) {
                case '(':
                    resultArray = parameterTypes;
                    break;
                case ')':
                    resultArray = returnType;
                    break;
                default:
                    let posStruct = {currentPos: pos, newPos: -1};
                    resultArray.push(this.decodeSignatureComponent(descriptor, posStruct))
                    if (posStruct.newPos > -1) {
                        pos = posStruct.newPos;
                    }
                    break;
            }
        }

        result.returnType = resultArray[0];
        if (parameterTypes.length > 0) {
            result.parameterTypes = parameterTypes;
        }

        return result;
    }

    createFieldSignature(name, descriptor, accessType) {
        return `${this.decodeAccessFlags(accessType)}${this.decodeSignatureComponent(descriptor, {currentPos: 0, newPos: 0})} ${name};`;
    }

    createMethodSignature(name, descriptor, accessType) {
        let signatureParts = this.decodeSignature(descriptor);
        return `${this.decodeAccessFlags(accessType)}${signatureParts.returnType} ${name}(${(signatureParts.parameterTypes || []).join(', ')});`;
    }

    getFieldDescriptor(field) {
        let cp = this._constantPool;
        let name = cp.getValue(field.nameIndex).string;
        let descriptor = cp.getValue(field.descriptorIndex).string;
        return {
            accessFlagsString: this.decodeAccessFlags(field.accessFlags),
            name,
            descriptor,
            type: this.decodeDescriptorType(descriptor),
            signature: this.decodeSignature(descriptor).returnType,
            accessFlags: field.accessFlags,
            text: this.createFieldSignature(name, descriptor, field.accessFlags)
        };
    }

    getMethodCode(method) {
        for (let attr of method.attributes) {
            if (attr?.info?.code) {
                return attr.info.code;
            }
        }

        return null;
    }

    getMethodLocalVariables(method) {
        for (let attr of method.attributes) {
            if (!attr) {
                continue;
            }
            let attrName = this._constantPool.resolve(attr.attributeNameIndex).value;
            if (attrName == "LocalVariableTable") {
                return attr.info;
            }
        }

        return null;
    }

    getMethodDescriptor(method) {
        let cp = this._constantPool;
        let name = cp.getValue(method.nameIndex).string;
        let descriptor = cp.getValue(method.signatureIndex).string;
        return {
            className: cp.ca.className,
            accessFlagsString: this.decodeAccessFlags(method.accessFlags),
            name,
            descriptor,
            signature: this.decodeSignature(descriptor),
            accessFlags: method.accessFlags,
            shortText: this.createMethodSignature(name, descriptor, method.accessFlags),
            longText: this.createMethodSignature(`${this.friendlyClassName}.${name}`, descriptor, method.accessFlags)};
    }

    getMethodAttributeByName (method, attributeName) {

    }

    getElementValue(reader) {
        let tag = String.fromCharCode(reader.readByte());
        let elementValue = { tag };

        switch (tag) {
            case '[':
                elementValue.values = [];
                let numValues = reader.readUShort();
                for (let idx = 0; idx < numValues; idx++) {
                    elementValue.values.push(this.getElementValue(reader));
                }
                break;
            case '@':
                elementValue.annotationValue = this.getAnnotation(reader);
                break;
            case 'c':
                elementValue.classInfoIndex = reader.readUShort();
                break;
            case 'e':
                let typeNameIndex = reader.readUShort();
                let constNameIndex = reader.readUShort();
                elementValue.enumConstValue = { typeNameIndex, constNameIndex };
                break;
            case 'B':
            case 'C':
            case 'D':
            case 'F':
            case 'I':
            case 'J':
            case 'S':
            case 'Z':
            case 's':
                elementValue.constValueIndex = reader.readUShort();
                break;
            default:
                console.error(`elementValue tag [${tag}] is not defined`);
            }

        return elementValue;
    }

    getAnnotation(reader) {
        let annotation = {};
        annotation.typeIndex = reader.readUShort();
        let numElementValuePairs = reader.readUShort();
        annotation.elementValuePairs = [];
        for (let j = 0; j < numElementValuePairs; j++) {
            let elementNameIndex = reader.readUShort();
            let value = this.getElementValue(reader);
            annotation.elementValuePairs.push({ elementNameIndex, value });
        }
        return annotation;
    }

    getAnnotations(reader) {
        let numAnnotations = reader.readUShort();
        let annotations = [];
        for (let i = 0; i < numAnnotations; i++) {
            annotations.push(this.getAnnotation(reader));
        }

        return annotations;
    }

    readAttributes(attributeNameIndex, bytes) {

        let reader = new CodeReader(bytes);
        let attribute = { attributeNameIndex };


        let item = this._constantPool.getValue(attributeNameIndex);
        attribute.type = item.tag;

        switch (item.tag) {

            case TAGS.CONSTANT_Long:
            case TAGS.CONSTANT_Float:
            case TAGS.CONSTANT_Double:
            case TAGS.CONSTANT_Integer:
            case TAGS.CONSTANT_String:
                attribute.type = ATTRIBUTE_TYPES.ConstantValue;
                attribute.constantValueIndex = reader.readUShort();
                return attribute;
            case TAGS.CONSTANT_Utf8:
                switch (item.string) {
                    case ATTRIBUTE_TYPES.Code:
                        attribute.maxStack = reader.readUShort();
                        attribute.maxLocals = reader.readUShort();
                        let codeLength = reader.readUInt();
                        attribute.code = reader.readBytes(codeLength);

                        let exceptionTableLength = reader.readUShort();
                        attribute.exceptionTable = [];
                        for (let i = 0; i < exceptionTableLength; i++) {
                            let startPC = reader.readUShort();
                            let endPC = reader.readUShort();
                            let handlerPC = reader.readUShort();
                            let catchType = reader.readUShort();
                            attribute.exceptionTable.push({ startPC, endPC, handlerPC, catchType });
                        }

                        let attributesCount = reader.readUShort();
                        attribute.attributes = [];
                        for (let i = 0; i < attributesCount; i++) {
                            let attributeNameIndex = reader.readUShort();
                            let attributeLength = reader.readUInt();
                            let info = reader.readBytes(attributeLength);
                            attribute.attributes.push({ attributeNameIndex, attributeLength, info });
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.SourceFile:
                        attribute.sourceFileIndex = reader.readUShort();
                        return attribute;

                    case ATTRIBUTE_TYPES.Exceptions:
                        let numberOfExceptions = reader.readUShort();
                        attribute.exceptionIndexTable = [];
                        for (let i = 0; i < numberOfExceptions; i++) {
                            attribute.exceptionIndexTable.push(reader.readUShort());
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.InnerClasses:
                        let numberOfClasses = reader.readUShort();
                        attribute.classes = [];
                        for (let i = 0; i < numberOfClasses; i++) {
                            let inner = {};
                            inner.inner_classInfoIndex = reader.readUShort();
                            inner.outer_classInfoIndex = reader.readUShort();
                            inner.innerNameIndex = reader.readUShort();
                            inner.innerClassAccessFlags = reader.readUShort();
                            attribute.classes.push(inner);
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.MethodParameters:
                        let parametersCount = reader.readByte();
                        attribute.parameters = [];
                        for (let i = 0; i < parametersCount; i++) {
                            let parameterNameIndex = reader.readUShort();
                            let parameterAccessFlags = reader.readUShort();
                            attribute.parameters.push({ parameterNameIndex, parameterAccessFlags });
                        }
                        return attribute;

                    case ATTRIBUTE_TYPES.Signature:
                        attribute.signatureIndex = reader.readUShort();
                        return attribute;

                    case ATTRIBUTE_TYPES.BootstrapMethods:
                        let numBootstrapMethods = reader.readByte();
                        attribute.bootstrap_methods = [];
                        for (let i = 0; i < numBootstrapMethods; i++) {
                            let bootstrapMethodRef = reader.readUShort();
                            let numBootstrapArguments = reader.readUShort();
                            let bootstrapArguments = [];
                            for (let j = 0; j < numBootstrapArguments; j++) {
                                let bootstrapArgument = reader.readUShort();
                                bootstrapArguments.push(bootstrapArgument);
                            }
                            attribute.bootstrapMethods.push({ bootstrapMethodRef, bootstrapArguments });
                        }
                        return attribute;
                        
                    case ATTRIBUTE_TYPES.RuntimeVisibleAnnotations:
                    case ATTRIBUTE_TYPES.RuntimeInvisibleAnnotations: {
                        attribute.annotations = this.getAnnotations(reader);
                        return attribute;
                    }
                    case ATTRIBUTE_TYPES.RuntimeVisibleParameterAnnotations:
                    case ATTRIBUTE_TYPES.RuntimeInvisibleParameterAnnotations: {
                        let numParameters = reader.readByte();
                        attribute.parameterAnnotations = [];
                        for (let i = 0; i < numParameters; i++) {
                            attribute.parameterAnnotations.push(this.getAnnotations(reader));
                        }
                        return attribute;
                    }
                    case ATTRIBUTE_TYPES.Deprecated:
                    case ATTRIBUTE_TYPES.Synthetic:
                        return attribute;

                    case ATTRIBUTE_TYPES.EnclosingMethod:
                        attribute.classIndex = reader.readUShort();
                        attribute.methodIndex = reader.readUShort();
                        return attribute;

                    case ATTRIBUTE_TYPES.AnnotationDefault:
                        attribute.defaultValue = this.getElementValue(reader);
                        return attribute;

                    case ATTRIBUTE_TYPES.NestHost:
                        attribute.hostClassIndex = reader.readUShort();
                        return attribute;

                    case ATTRIBUTE_TYPES.NestMembers:
                        attribute.numberOfClasses = reader.readUShort();
                        attribute.classes = reader.readBytes(attribute.numberOfClasses * 2);
                        return attribute;

                    default:
                        // throw new Error("This attribute type is not supported yet. [" + JSON.stringify(item) + "]");
                        console.log("This attribute type is not supported yet. [" + JSON.stringify(item) + "]");
                    }

            default:
                // throw new Error("This attribute type is not supported yet. [" + JSON.stringify(item) + "]");
                console.log("This attribute type is not supported yet. [" + JSON.stringify(item) + "]");
        }
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

        this._accessFlags = this._reader.readUShort();

        this.thisClass = this._reader.readUShort();

        this.superClass = this._reader.readUShort();


        this.interfaces = [];
        let interfacesCount = this._reader.readUShort();
        for (let i = 0; i < interfacesCount; i++) {
            let index = this._reader.readUShort();
            if (index != 0) {
                this.interfaces.push(index);
            }
        }

        this._fields = [];
        let fieldsCount = this._reader.readUShort();
        for (let i = 0; i < fieldsCount; i++) {
            let accessFlags = this._reader.readUShort();
            let nameIndex = this._reader.readUShort();
            let descriptorIndex = this._reader.readUShort();
            let attributesCount = this._reader.readUShort();
            let fieldInfo = {
                accessFlags,
                nameIndex,
                descriptorIndex,
                attributesCount,
                attributes: []
            }
            for (let j = 0; j < attributesCount; j++) {
                let attributeNameIndex = this._reader.readUShort();
                let attributeLength = this._reader.readUInt();
                let info = this._reader.readBytes(attributeLength);
                fieldInfo.attributes.push({ attributeNameIndex, attributeLength, info });
            }
            this._fields.push(fieldInfo);
        }


        this._methods = [];
        let methodsCount = this._reader.readUShort();
        for (let i = 0; i < methodsCount; i++) {
            let accessFlags = this._reader.readUShort();
            let nameIndex = this._reader.readUShort();
            let signatureIndex = this._reader.readUShort();
            let attributesCount = this._reader.readUShort();
            let methodInfo = {
                accessFlags,
                nameIndex,
                signatureIndex,
                attributesCount,
                attributes: []
            }
            for (let j = 0; j < attributesCount; j++) {
                let attributeNameIndex = this._reader.readUShort();
                let attributeLength = this._reader.readUInt();
                let info = this.readAttributes(attributeNameIndex, this._reader.readBytes(attributeLength));
                let attribute = {
                    attributeNameIndex,
                    attributeLength,
                    info
                }
                methodInfo.attributes.push(attribute);
            }

            this._methods.push(methodInfo);
        }


        this.attributes = [];
        let attributesCount = this._reader.readUShort();
        for (let i = 0; i < attributesCount; i++) {
            let attributeNameIndex = this._reader.readUShort();
            let attributeLength = this._reader.readUInt();
            let info = this.readAttributes(attributeNameIndex, this._reader.readBytes(attributeLength));
            let attribute = {
                attributeNameIndex,
                attributeLength,
                info
            }
            this.attributes.push(attribute);
        }
    }
}

module.exports = ClassReader;