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
        let methodDescriptor = this.classData.getMethodDescriptor(method);
        let code = this.classData.getMethodCode(method);
        // let localVars = this.classData.getMethodLocalVariables(method);
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
                    break;
                case OPCODES.OP_iconst_m1:
                    break;
                case OPCODES.OP_iconst_0:
                    break;
                case OPCODES.OP_iconst_1:
                    break;
                case OPCODES.OP_iconst_2:
                    break;
                case OPCODES.OP_iconst_3:
                    break;
                case OPCODES.OP_iconst_4:
                    break;
                case OPCODES.OP_iconst_5:
                    break;
                case OPCODES.OP_lconst_0:
                    break;
                case OPCODES.OP_lconst_1:
                    break;
                case OPCODES.OP_fconst_0:
                    break;
                case OPCODES.OP_fconst_1:
                    break;
                case OPCODES.OP_fconst_2:
                    break;
                case OPCODES.OP_dconst_0:
                    break;
                case OPCODES.OP_dconst_1:
                    break;
                case OPCODES.OP_bipush:
                    byte = this.codeReader.readByte();
                    break;
                case OPCODES.OP_sipush:
                    value = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ldc:
                    index = this.codeReader.readByte();
                    break;
                case OPCODES.OP_ldc_w:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_ldc2_w:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_iload:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_lload:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_fload:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_dload:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_aload:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_iload_0:
                    break;
                case OPCODES.OP_iload_1:
                    break;
                case OPCODES.OP_iload_2:
                    break;
                case OPCODES.OP_iload_3:
                    break;
                case OPCODES.OP_lload_0:
                    break;
                case OPCODES.OP_lload_1:
                    break;
                case OPCODES.OP_lload_2:
                    break;
                case OPCODES.OP_lload_3:
                    break;
                case OPCODES.OP_fload_0:
                    break;
                case OPCODES.OP_fload_1:
                    break;
                case OPCODES.OP_fload_2:
                    break;
                case OPCODES.OP_fload_3:
                    break;
                case OPCODES.OP_dload_0:
                    break;
                case OPCODES.OP_dload_1:
                    break;
                case OPCODES.OP_dload_2:
                    break;
                case OPCODES.OP_dload_3:
                    break;
                case OPCODES.OP_aload_0:
                    break;
                case OPCODES.OP_aload_1:
                    break;
                case OPCODES.OP_aload_2:
                    break;
                case OPCODES.OP_aload_3:
                    break;
                case OPCODES.OP_iaload:
                    break;
                case OPCODES.OP_laload:
                    break;
                case OPCODES.OP_faload:
                    break;
                case OPCODES.OP_daload:
                    break;
                case OPCODES.OP_aaload:
                    break;
                case OPCODES.OP_baload:
                    break;
                case OPCODES.OP_caload:
                    break;
                case OPCODES.OP_saload:
                    break;
                case OPCODES.OP_istore:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_lstore:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_fstore:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_dstore:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_astore:
                    index = wide ? this.codeReader.readUShort() : this.codeReader.readByte()
                    wide = false;
                    break;
                case OPCODES.OP_istore_0:
                    break;
                case OPCODES.OP_istore_1:
                    break;
                case OPCODES.OP_istore_2:
                    break;
                case OPCODES.OP_istore_3:
                    break;
                case OPCODES.OP_lstore_0:
                    break;
                case OPCODES.OP_lstore_1:
                    break;
                case OPCODES.OP_lstore_2:
                    break;
                case OPCODES.OP_lstore_3:
                    break;
                case OPCODES.OP_fstore_0:
                    break;
                case OPCODES.OP_fstore_1:
                    break;
                case OPCODES.OP_fstore_2:
                    break;
                case OPCODES.OP_fstore_3:
                    break;
                case OPCODES.OP_dstore_0:
                    break;
                case OPCODES.OP_dstore_1:
                    break;
                case OPCODES.OP_dstore_2:
                    break;
                case OPCODES.OP_dstore_3:
                    break;
                case OPCODES.OP_astore_0:
                    break;
                case OPCODES.OP_astore_1:
                    break;
                case OPCODES.OP_astore_2:
                    break;
                case OPCODES.OP_astore_3:
                    break;
                case OPCODES.OP_iastore:
                    break;
                case OPCODES.OP_lastore:
                    break;
                case OPCODES.OP_fastore:
                    break;
                case OPCODES.OP_dastore:
                    break;
                case OPCODES.OP_aastore:
                    break;
                case OPCODES.OP_bastore:
                    break;
                case OPCODES.OP_castore:
                    break;
                case OPCODES.OP_sastore:
                    break;
                case OPCODES.OP_pop:
                    break;
                case OPCODES.OP_pop2:
                    break;
                case OPCODES.OP_dup:
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
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_jsr:
                    index = this.codeReader.readUShort();
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
                    break;
                case OPCODES.OP_lreturn:
                    break;
                case OPCODES.OP_freturn:
                    break;
                case OPCODES.OP_dreturn:
                    break;
                case OPCODES.OP_areturn:
                    break;
                case OPCODES.OP_return:
                    break;
                case OPCODES.OP_getstatic:
                    index = this.codeReader.readUShort();
                    if (isFieldListeners) {
                        this.emit('field_access', method, this.classData.constantPool.resolve(index));
                    }
                    break;
                case OPCODES.OP_putstatic:
                    index = this.codeReader.readUShort();
                    if (isFieldListeners) {
                        this.emit('field_access', method, this.classData.constantPool.resolve(index));
                    }
                    break;
                case OPCODES.OP_getfield:
                    index = this.codeReader.readUShort();
                    if (isFieldListeners) {
                        this.emit('field_access', method, this.classData.constantPool.resolve(index));
                    }
                    break;
                case OPCODES.OP_putfield:
                    index = this.codeReader.readUShort();
                    if (isFieldListeners) {
                        this.emit('field_access', method, this.classData.constantPool.resolve(index));
                    }
                    break;
                case OPCODES.OP_invokevirtual:
                    index = this.codeReader.readUShort();
                    data = this.classData.constantPool.resolve(index);
                    thisClass = this.classData.className;
                    thatClass = data.className;
                    if (!this.loader.isJavaAPIClass(data.className) && !this.isMethodAlreadyLoaded(data.text)) {
                        await this.loadNewMethod(data);
                    }
                    if (isInvokeListeners && thisClass != thatClass) {
                        this.emit('invoke', thisClass, thatClass);
                    }
                    break;
                case OPCODES.OP_invokespecial:
                    index = this.codeReader.readUShort();
                    data = this.classData.constantPool.resolve(index);
                    thisClass = this.classData.className;
                    thatClass = data.className;
                    if (!this.loader.isJavaAPIClass(data.className) && !this.isMethodAlreadyLoaded(data.text)) {
                        await this.loadNewMethod(data);
                    }
                    if (isInvokeListeners && thisClass != thatClass) {
                        this.emit('invoke', thisClass, thatClass);
                    }
                    break;
                case OPCODES.OP_invokestatic:
                    index = this.codeReader.readUShort();
                    data = this.classData.constantPool.resolve(index);
                    thisClass = this.classData.className;
                    thatClass = data.className;
                    if (!this.loader.isJavaAPIClass(data.className) && !this.isMethodAlreadyLoaded(data.text)) {
                        await this.loadNewMethod(data);
                    }
                    if (isInvokeListeners && thisClass != thatClass) {
                        this.emit('invoke', thisClass, thatClass);
                    }
                    break;
                case OPCODES.OP_invokeinterface:
                    index = this.codeReader.readUShort();
                    count = this.codeReader.readByte();
                    this.codeReader.readByte();
                    data = this.classData.constantPool.resolve(index);
                    thisClass = this.classData.className;
                    thatClass = data.className;
                    if (!this.loader.isJavaAPIClass(data.className) && !this.isMethodAlreadyLoaded(data.text)) {
                        await this.loadNewMethod(data);
                    }
                    if (isInvokeListeners && thisClass != thatClass) {
                        this.emit('invoke', thisClass, thatClass);
                    }
                    break;
                case OPCODES.OP_invokedynamic:
                    index = this.codeReader.readUShort();
                    this.codeReader.readUShort();
                    // data = this.classData.constantPool.resolve(index);
                    // thisClass = this.classData.className;
                    // thatClass = data.className;
                    // if (!this.loader.isJavaAPIClass(data.className) && !this.isMethodAlreadyLoaded(data.text)) {
                    //     await this.loadNewMethod(data);
                    // }
                    // if (isInvokeListeners && thisClass != thatClass) {
                    //     this.emit('invoke', thisClass, thatClass);
                    // }
                    break;
                case OPCODES.OP_new:
                    index = this.codeReader.readUShort();
                    break;
                case OPCODES.OP_newarray:
                    index = this.codeReader.readByte();
                    break;
                case OPCODES.OP_anewarray:
                    index = this.codeReader.readUShort();
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
}

module.exports = JavaEmulator;