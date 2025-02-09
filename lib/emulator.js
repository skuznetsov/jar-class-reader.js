const CLASS_ATTRIBUTES = require('./class_attributes');
const EventEmmiter = require('events');
const CodeReader = require('./code_reader');
const crc = require('./crc64');
// const crypto = require('crypto');

const OPCODES = CLASS_ATTRIBUTES.OPCODES;

class JavaEmulator extends EventEmmiter {

    constructor(loader, classData) {
        super();
        this.loader = loader;
        this.classData = classData;
        this.pc = 0;
        this.stack = [];
        this.callStack = [];
        this.currentMethod = null;
        this.codeReader = null;
        this.loadedMethods = {};
    }

    pushCallState() {
        this.callStack.push({classData: this.classData, method: this.currentMethod, reader: this.codeReader});
    }

    popCallState() {
        if (this.callStack.length > 0) {
            let callState = this.callStack.pop();
            this.classData = callState.classData;
            this.currentMethod = callState.method;
            this.codeReader = callState.reader;
        }
    }

    isMethodAlreadyLoaded(method) {
        let crcValue = crc.calculate(Buffer.from(method));

        if (this.loadedMethods[crcValue]) {
            return true;
        }
        this.loadedMethods[crcValue] = true;
        return false;
    }

    async loadNewMethod(data) {
        let ca = await this.loader.getClass(data.className, true);
        if (!ca) {
            if (!this.loader.isJavaAPIClass(data.className)) {
                // console.error(`Class ${data.className} cannot be found.`);
                this.emit("missedClass", data.className);
            }
            return;
        }

        let methods = ca.methods;
        let cp = ca.constantPool;
        for ( let newMethod of methods) {
            let methodName = cp.resolve(newMethod.nameIndex).value;
            let methodType = cp.resolve(newMethod.signatureIndex).value;
            if (methodName == data.methodName && methodType == data.methodType) {
                let code = ca.getMethodCode(newMethod);
                if (!code) {
                    return;
                }
                let codeReader = new CodeReader(code);
                this.pushCallState();
                this.classData = ca;
                this.currentMethod = newMethod;
                let params = this.classData.decodeSignature(this.classData.constantPool.resolve(this.currentMethod.signatureIndex).value);
                this.currentMethod.isStatic = (this.currentMethod.accessFlags & CLASS_ATTRIBUTES.ACCESS_FLAGS.ACC_STATIC) == CLASS_ATTRIBUTES.ACCESS_FLAGS.ACC_STATIC;
                this.currentMethod.parameterTypes = params.parameterTypes;
                this.currentMethod.returnType = params.returnType;
                this.currentMethod.params = params.parameterTypes.length;
                this.codeReader = codeReader;
                return;
            }
        }
    }

    async emulateMethod(method){
        let index = 0, low = 0, high = 0, size = 0, byte = 0, constant = 0;
        let data, value, def, jmp, count, dim;
        let thisClass, thatClass;

        if (!method) {
            return;
        }
        this.currentMethod = method;
        let code = this.classData.getMethodCode(method);
        let localVars = this.classData.getMethodLocalVariables(method);
        let params = this.classData.decodeSignature(this.classData.constantPool.resolve(this.currentMethod.signatureIndex).value);
        this.currentMethod.isStatic = (this.currentMethod.accessFlags & CLASS_ATTRIBUTES.ACCESS_FLAGS.ACC_STATIC) == CLASS_ATTRIBUTES.ACCESS_FLAGS.ACC_STATIC;
        this.currentMethod.parameterTypes = params.parameterTypes;
        this.currentMethod.params = params.parameterTypes.length;
        this.currentMethod.returnType = params.returnType;
        if (!code || !code.length) {
            return;
        }
        this.codeReader = new CodeReader(code);
        let isFieldListeners = this.listenerCount('field_access') > 0;
        let isInvokeListeners = this.listenerCount('invoke') > 0;
        let wide = false;

        while(!this.codeReader.EOF) {
            let instruction = this.codeReader.readByte();
            switch(instruction) {
                case OPCODES.OP_nop:
                    break;
                case OPCODES.OP_aconst_null:
                    this.stack.push("null");
                    break;
                case OPCODES.OP_iconst_m1:
                    this.stack.push("-1");
                    break;
                case OPCODES.OP_iconst_0:
                    this.stack.push("0");
                    break;
                case OPCODES.OP_iconst_1:
                    this.stack.push("1");
                    break;
                case OPCODES.OP_iconst_2:
                    this.stack.push("2");
                    break;
                case OPCODES.OP_iconst_3:
                    this.stack.push("3");
                    break;
                case OPCODES.OP_iconst_4:
                    this.stack.push("4");
                    break;
                case OPCODES.OP_iconst_5:
                    this.stack.push("5");
                    break;
                case OPCODES.OP_lconst_0:
                    this.stack.push("0L");
                    break;
                case OPCODES.OP_lconst_1:
                    this.stack.push("1L");
                    break;
                case OPCODES.OP_fconst_0:
                    this.stack.push("0.0f");
                    break;
                case OPCODES.OP_fconst_1:
                    this.stack.push("1.0f");
                    break;
                case OPCODES.OP_fconst_2:
                    this.stack.push("2.0f");
                    break;
                case OPCODES.OP_dconst_0:
                    this.stack.push("0.0");
                    break;
                case OPCODES.OP_dconst_1:
                    this.stack.push("1.0");
                    break;
                case OPCODES.OP_bipush:
                    byte = this.codeReader.readByte();
                    this.stack.push(byte.toString());
                    break;
                case OPCODES.OP_sipush:
                    value = this.codeReader.readUShort();
                    this.stack.push(value.toString());
                    break;
                    // The index is an unsigned byte that must be a valid index into the run-time constant pool of the current class (§2.5.5).
                    // The run-time constant pool entry at index must be loadable (§5.1), and not any of the following:
                    // A numeric constant of type long or double.
                    // A symbolic reference to a dynamically-computed constant whose field descriptor is J (denoting long) or D (denoting double).
                    // If the run-time constant pool entry is a numeric constant of type int or float, then the value of that numeric constant is pushed onto the operand stack as an int or float, respectively.
                    // Otherwise, if the run-time constant pool entry is a string constant, that is, a reference to an instance of class String, then value, a reference to that instance, is pushed onto the operand stack.
                    // Otherwise, if the run-time constant pool entry is a symbolic reference to a class or interface, then the named class or interface is resolved (§5.4.3.1) and value, a reference to
                    // the Class object representing that class or interface, is pushed onto the operand stack.
                    // Otherwise, the run-time constant pool entry is a symbolic reference to a method type, a method handle, or a dynamically-computed constant.
                    // The symbolic reference is resolved (§5.4.3.5, §5.4.3.6) and value, the result of resolution, is pushed onto the operand stack.
                case OPCODES.OP_ldc:
                    index = this.codeReader.readByte();
                    this.stack.push(this.classData.constantPool.resolve(index).value);
                    break;
                case OPCODES.OP_ldc_w:
                    index = this.codeReader.readUShort();
                    this.stack.push(this.classData.constantPool.resolve(index).value);
                    break;
                case OPCODES.OP_ldc2_w:
                    index = this.codeReader.readUShort();
                    this.stack.push(this.classData.constantPool.resolve(index).value);
                    break;
                case OPCODES.OP_iload:
                case OPCODES.OP_lload:
                case OPCODES.OP_fload:
                case OPCODES.OP_dload:
                case OPCODES.OP_aload:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    if (index < this.currentMethod.params) {
                        if (!this.currentMethod.isStatic && index == 0) {
                            this.stack.push("this");
                        } else {
                            this.stack.push(`arg${index}`);
                        }
                    } else {
                        this.stack.push(`var${index - this.currentMethod.params}`);
                    }
                    break;
                case OPCODES.OP_aload_0:
                case OPCODES.OP_iload_0:
                case OPCODES.OP_lload_0:
                case OPCODES.OP_fload_0:
                case OPCODES.OP_dload_0:
                    if (!this.currentMethod.isStatic) {
                        this.stack.push("this");
                    } else if (this.currentMethod.params > 0) {
                            this.stack.push("arg0");
                    } else {
                        this.stack.push("var0");
                    }
                    break;
                case OPCODES.OP_aload_1:
                case OPCODES.OP_iload_1:
                case OPCODES.OP_lload_1:
                case OPCODES.OP_fload_1:
                case OPCODES.OP_dload_1:
                    if (this.currentMethod.params > 0) {
                        this.stack.push(`arg${this.currentMethod.isStatic ? 1 : 0}`);
                    } else {
                        this.stack.push("var1");
                    }
                    break;
                case OPCODES.OP_aload_2:
                case OPCODES.OP_iload_2:
                case OPCODES.OP_lload_2:
                case OPCODES.OP_fload_2:
                case OPCODES.OP_dload_2:
                    if (this.currentMethod.params > 1) {
                        this.stack.push(`arg${this.currentMethod.isStatic ? 2 : 1}`);
                    } else {
                        this.stack.push("var2");
                    }
                    break;
                case OPCODES.OP_aload_3:
                case OPCODES.OP_iload_3:
                case OPCODES.OP_lload_3:
                case OPCODES.OP_fload_3:
                case OPCODES.OP_dload_3:
                    if (this.currentMethod.params > 2) {
                        this.stack.push(`arg${this.currentMethod.isStatic ? 3 : 2}`);
                    } else {
                        this.stack.push("var3");
                    }
                    break;
                case OPCODES.OP_iaload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_laload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_faload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_daload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_aaload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_baload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_caload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_saload:
                {
                    let idx = this.stack.pop();
                    let arrayName = this.stack.pop();
                    this.stack.push(`${arrayName}[${idx}]`);
                    break;
                }
                case OPCODES.OP_istore:
                case OPCODES.OP_lstore:
                case OPCODES.OP_fstore:
                case OPCODES.OP_dstore:
                case OPCODES.OP_astore:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    let varName = null;
                    if (index < this.currentMethod.params) {
                        if (!this.currentMethod.isStatic && index == 0) {
                            varName = "this";
                        } else {
                            varname = `arg${index}`;
                        }
                    } else {
                        varName = `var${index - this.currentMethod.params}`;
                    }

                    if (this.stack.length > 0) {
                        this.stack.push(`${varName} = ${this.stack.pop()}`);
                    }
                    break;
                case OPCODES.OP_istore_0:
                case OPCODES.OP_lstore_0:
                case OPCODES.OP_fstore_0:
                case OPCODES.OP_dstore_0:
                case OPCODES.OP_astore_0:
                {
                    let varName = null;
                    if (!this.currentMethod.isStatic) {
                        varName = "this";
                    } else if (this.currentMethod.params > 0) {
                        varName = "arg0";
                    } else {
                        varName = "var0";
                    }
                    if (this.stack.length > 0) {
                        this.stack.push(`${varName} = ${this.stack.pop()}`);
                    }
                    break;
                }
                case OPCODES.OP_istore_1:
                case OPCODES.OP_lstore_1:
                case OPCODES.OP_fstore_1:
                case OPCODES.OP_dstore_1:
                case OPCODES.OP_astore_1:
                {
                    let varName = null;
                    if (this.currentMethod.params > 1) {
                        this.stack.push(`arg${this.currentMethod.isStatic ? 1 : 0}`);
                    } else {
                        varName = "var1";
                    }
                    if (this.stack.length > 0) {
                        this.stack.push(`${varName} = ${this.stack.pop()}`);
                    }
                    break;
                }
                case OPCODES.OP_istore_2:
                case OPCODES.OP_lstore_2:
                case OPCODES.OP_fstore_2:
                case OPCODES.OP_dstore_2:
                case OPCODES.OP_astore_2:
                {
                    let varName = null;
                    if (this.currentMethod.params > 2) {
                        this.stack.push(`arg${this.currentMethod.isStatic ? 2 : 1}`);
                    } else {
                        varName = "var2";
                    }
                    if (this.stack.length > 0) {
                        this.stack.push(`${varName} = ${this.stack.pop()}`);
                    }
                    break;
                }
                case OPCODES.OP_istore_3:
                case OPCODES.OP_lstore_3:
                case OPCODES.OP_fstore_3:
                case OPCODES.OP_dstore_3:
                case OPCODES.OP_astore_3:
                {
                    let varName = null;
                    if (this.currentMethod.params > 3) {
                        this.stack.push(`arg${this.currentMethod.isStatic ? 3 : 2}`);
                    } else {
                        varName = "var3";
                    }
                    if (this.stack.length > 0) {
                        this.stack.push(`${varName} = ${this.stack.pop()}`);
                    }
                    break;
                }
                case OPCODES.OP_iastore:
                case OPCODES.OP_lastore:
                case OPCODES.OP_fastore:
                case OPCODES.OP_dastore:
                case OPCODES.OP_aastore:
                case OPCODES.OP_bastore:
                case OPCODES.OP_castore:
                case OPCODES.OP_sastore:
                {
                    let value = this.stack.pop();
                    let index = this.stack.pop();
                    let arrayRef = this.stack.pop();

                    this.stack.push(`${arrayRef}[${index}] = ${value}`);
                    break;
                }
                case OPCODES.OP_pop:
                    this.stack.pop();
                    break;
                case OPCODES.OP_pop2:
                    this.stack.pop();
                    this.stack.pop();
                    break;
                case OPCODES.OP_dup:
                    this.stack.push(this.stack[this.stack.length - 1]);
                    break;
                case OPCODES.OP_dup_x1:
                    break;
                case OPCODES.OP_dup_x2:
                    break;
                case OPCODES.OP_dup2:
                    break;
                case OPCODES.OP_dup2_x1:
                    break;
                case OPCODES.OP_dup2_x2:
                    break;
                case OPCODES.OP_swap:
                    break;
                case OPCODES.OP_iadd:
                    break;
                case OPCODES.OP_ladd:
                    break;
                case OPCODES.OP_fadd:
                    break;
                case OPCODES.OP_dadd:
                    break;
                case OPCODES.OP_isub:
                    break;
                case OPCODES.OP_lsub:
                    break;
                case OPCODES.OP_fsub:
                    break;
                case OPCODES.OP_dsub:
                    break;
                case OPCODES.OP_imul:
                    break;
                case OPCODES.OP_lmul:
                    break;
                case OPCODES.OP_fmul:
                    break;
                case OPCODES.OP_dmul:
                    break;
                case OPCODES.OP_idiv:
                    break;
                case OPCODES.OP_ldiv:
                    break;
                case OPCODES.OP_fdiv:
                    break;
                case OPCODES.OP_ddiv:
                    break;
                case OPCODES.OP_irem:
                    break;
                case OPCODES.OP_lrem:
                    break;
                case OPCODES.OP_frem:
                    break;
                case OPCODES.OP_drem:
                    break;
                case OPCODES.OP_ineg:
                    break;
                case OPCODES.OP_lneg:
                    break;
                case OPCODES.OP_fneg:
                    break;
                case OPCODES.OP_dneg:
                    break;
                case OPCODES.OP_ishl:
                    break;
                case OPCODES.OP_lshl:
                    break;
                case OPCODES.OP_ishr:
                    break;
                case OPCODES.OP_lshr:
                    break;
                case OPCODES.OP_iushr:
                    break;
                case OPCODES.OP_lushr:
                    break;
                case OPCODES.OP_iand:
                    break;
                case OPCODES.OP_land:
                    break;
                case OPCODES.OP_ior:
                    break;
                case OPCODES.OP_lor:
                    break;
                case OPCODES.OP_ixor:
                    break;
                case OPCODES.OP_lxor:
                    break;
                case OPCODES.OP_iinc:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte();
                    constant = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                break;
                case OPCODES.OP_i2l:
                    break;
                case OPCODES.OP_i2f:
                    break;
                case OPCODES.OP_i2d:
                    break;
                case OPCODES.OP_l2i:
                    break;
                case OPCODES.OP_l2f:
                    break;
                case OPCODES.OP_l2d:
                    break;
                case OPCODES.OP_f2i:
                    break;
                case OPCODES.OP_f2l:
                    break;
                case OPCODES.OP_f2d:
                    break;
                case OPCODES.OP_d2i:
                    break;
                case OPCODES.OP_d2l:
                    break;
                case OPCODES.OP_d2f:
                    break;
                case OPCODES.OP_i2b:
                    break;
                case OPCODES.OP_i2c:
                    break;
                case OPCODES.OP_i2s:
                    break;
                case OPCODES.OP_lcmp:
                    break;
                case OPCODES.OP_fcmpl:
                    break;
                case OPCODES.OP_fcmpg:
                    break;
                case OPCODES.OP_dcmpl:
                    break;
                case OPCODES.OP_dcmpg:
                    break;
                case OPCODES.OP_ifeq:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ifne:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_iflt:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ifge:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ifgt:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ifle:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_icmpeq:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_icmpne:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_icmplt:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_icmpge:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_icmpgt:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_icmple:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_acmpeq:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_if_acmpne:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_goto:
                    index = this.codeReader.readShort();
                    break;
                case OPCODES.OP_jsr:
                    index = this.codeReader.readShort();
                    break;
                case OPCODES.OP_ret:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_tableswitch:
                    this.codeReader.pc += ( this.codeReader.pc % 4 ? 4 - this.codeReader.pc % 4 : 0)
                    def = this.codeReader.readUInt();
                    low = this.codeReader.readUInt();
                    high = this.codeReader.readUInt();
                    this.codeReader.pc += (high - low + 1) * 4;
                    break;
                case OPCODES.OP_lookupswitch: // TODO: Implement properly as per specs
                    this.codeReader.pc += ( this.codeReader.pc % 4 ? 4 - this.codeReader.pc % 4 : 0)
                    jmp = this.codeReader.readUInt();
                    size = this.codeReader.readUInt();
                    this.codeReader.pc += size * 8;
                    break;
                case OPCODES.OP_ireturn:
                    this.stack.push(`return ${this.stack.pop()};`);
                    break;
                case OPCODES.OP_lreturn:
                    this.stack.push(`return ${this.stack.pop()};`);
                    break;
                case OPCODES.OP_freturn:
                    this.stack.push(`return ${this.stack.pop()};`);
                    break;
                case OPCODES.OP_dreturn:
                    this.stack.push(`return ${this.stack.pop()};`);
                    break;
                case OPCODES.OP_areturn:
                    this.stack.push(`return ${this.stack.pop()};`);
                    break;
                case OPCODES.OP_return:
                    this.stack.push(`return;`);
                    break;
                case OPCODES.OP_getstatic:
                {
                    index = this.codeReader.readUShort();
                    let fieldDescriptor = this.classData.constantPool.resolve(index);
                    this.stack.push(fieldDescriptor.fieldName);
                    if (isFieldListeners) {
                        this.processFieldNotification(method, index);
                    }
                    break;
                }
                case OPCODES.OP_putstatic:
                {
                    index = this.codeReader.readUShort();
                    let fieldDescriptor = this.classData.constantPool.resolve(index);
                    if (this.stack.length > 0) {
                        this.stack.push(`${fieldDescriptor.fieldName} = ${this.stack.pop()}`);
                    }
                    if (isFieldListeners) {
                        this.processFieldNotification(method, index);
                    }
                    break;
                }
                case OPCODES.OP_getfield:
                {
                    index = this.codeReader.readUShort();
                    let objectRef = this.stack.pop();
                    let fieldDescriptor = this.classData.constantPool.resolve(index);
                    this.stack.push(objectRef + "." + fieldDescriptor.fieldName);
                    if (isFieldListeners) {
                        this.processFieldNotification(method, index);
                    }
                    break;
                }
                case OPCODES.OP_putfield:
                {
                    index = this.codeReader.readUShort();
                    let fieldDescriptor = this.classData.constantPool.resolve(index);
                    if (this.stack.length > 1) {
                        let value = this.stack.pop();
                        let objectRef = this.stack.pop();
                        this.stack.push(`${objectRef}.${fieldDescriptor.fieldName} = ${value}`);
                    }
                    if (isFieldListeners) {
                        this.processFieldNotification(method, index);
                    }
                    break;
                }
                case OPCODES.OP_invokevirtual:
                    index = this.codeReader.readUShort();
                    let methodData = this.classData.constantPool.resolve(index);
                    let args = [];
                    for (let idx = 0; idx < methodData.parameterTypes.length; idx++) {
                        args.unshift(this.stack.pop());
                    }
                    let objName = this.stack.pop();
                    let methodCall = `${objName}.${methodData.methodName}(${args.join(", ")})`;
                    this.stack.push(methodCall);
                    await this.processMethodNotification(index, isInvokeListeners);
                    break;
                case OPCODES.OP_invokespecial:
                {
                    index = this.codeReader.readUShort();
                    let methodData = this.classData.constantPool.resolve(index);
                    let args = [];
                    for (let idx = 0; idx < methodData.parameterTypes.length; idx++) {
                        args.unshift(this.stack.pop());
                    }
                    let objName = this.stack.pop();
                    let methodCall = `${objName}.${methodData.methodName}(${args.join(", ")})`;
                    this.stack.push(methodCall);
                    await this.processMethodNotification(index, isInvokeListeners);
                    break;
                }
                case OPCODES.OP_invokestatic:
                {
                    index = this.codeReader.readUShort();
                    let methodData = this.classData.constantPool.resolve(index);
                    let args = [];
                    for (let idx = 0; idx < methodData.parameterTypes.length; idx++) {
                        args.unshift(this.stack.pop());
                    }
                    let methodCall = `${methodData.className.replace("/",".")}.${methodData.methodName}(${args.join(", ")})`;
                    this.stack.push(methodCall);
                    await this.processMethodNotification(index, isInvokeListeners);
                    break;
                }
                case OPCODES.OP_invokeinterface:
                {
                    index = this.codeReader.readUShort();
                    count = this.codeReader.readUShort() >> 8;
                    let methodData = this.classData.constantPool.resolve(index);
                    let args = [];
                    for (let idx = 0; idx < methodData.parameterTypes?.length; idx++) {
                        args.unshift(this.stack.pop());
                    }
                    let objName = this.stack.pop();
                    let methodCall = `${objName}.${methodData.methodName}(${args.join(", ")})`;
                    this.stack.push(methodCall);
                    await this.processMethodNotification(index, isInvokeListeners);
                    break;
                }
                case OPCODES.OP_invokedynamic:
                {
                    index = this.codeReader.readUShort();
                    let methodData = this.classData.constantPool.resolve(index);
                    let args = [];
                    for (let idx = 0; idx < methodData.parameterTypes.length; idx++) {
                        args.unshift(this.stack.pop());
                    }
                    let methodCall = `${methodData.methodName}(${args.join(", ")})`;
                    this.stack.push(methodCall);
                    await this.processMethodNotification(index, isInvokeListeners);
                    break;
                }
                    
                case OPCODES.OP_new:
                    index = this.codeReader.readUShort();
                    this.stack.push(`new ${this.classData.constantPool.resolve(index).value}`);
                    break;
                case OPCODES.OP_newarray:
                    index = this.codeReader.readByte();
                    // TODO: implement propertly. Experimenting for now
                    this.stack.push(this.classData.constantPool.resolve(index).className);
                    break;
                case OPCODES.OP_anewarray:
                    index = this.codeReader.readUShort();
                    // TODO: implement propertly. Experimenting for now
                    this.stack.push(this.classData.constantPool.resolve(index).className);
                    break;
                case OPCODES.OP_arraylength:
                    break;
                case OPCODES.OP_athrow:
                    break;
                case OPCODES.OP_checkcast:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_instanceof:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_monitorenter:
                    break;
                case OPCODES.OP_monitorexit:
                    break;
                case OPCODES.OP_wide:
                    wide = true;
                    break;
                case OPCODES.OP_multianewarray:
                    index = this.codeReader.readUShort();
                    dim = this.codeReader.readByte();
                    break;
                case OPCODES.OP_ifnull:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ifnonnull:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_goto_w:
                    index = this.codeReader.readUInt();
                    break;
                case OPCODES.OP_jsr_w:
                    index = this.codeReader.readUInt();
                    break;
                default:
                    throw new ApplicationException(`No such code instruction: ${instruction}`);
            }
            if (this.codeReader.EOF) {
                this.popCallState();
            }
        }
    }

    async processMethodNotification(index, isInvokeListeners) {
        let data = this.classData.constantPool.resolve(index);
        let thisClass = this.classData.className;
        let thatClass = data.className;
        if (!this.loader.isJavaAPIClass(data.className) && !this.isMethodAlreadyLoaded(data.text)) {
            await this.loadNewMethod(data);
        }
        if (isInvokeListeners && thisClass != thatClass) {
            this.emit('invoke', thisClass, thatClass);
        }
    }

    processFieldNotification(method, index) {
        let methodDescriptor = this.classData.getMethodDescriptor(method);
        let fieldDescriptor = this.classData.constantPool.resolve(index);
        let to = fieldDescriptor.fieldType.replace(/^\[?L/, '').replace(/;$/, '');
        if (methodDescriptor.className != to) {
            this.emit('field_access', methodDescriptor.className, to);
        }
    }
}

module.exports = JavaEmulator;