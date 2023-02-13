class CRC64 {
    crc64_table = new BigUint64Array(256);

    constructor() {
        const CRC64_ECMA182_POLY = 0x42F0E1EBA9EA3693n;
    
        for (let i = 0n; i < 256n; i++) {
            let crc = 0n;
            let c = i << 56n;
    
            for (let bit = 0; bit < 8; bit++) {
                if ((crc ^ c) & 0x8000000000000000n) {
                    crc = (crc << 1n) ^ CRC64_ECMA182_POLY;
                } else {
                    crc <<= 1n;
                }
                c <<= 1n;
            }
            this.crc64_table[i] = crc;
        }        
    }
    
    calculate(str) {
        let bytes = Buffer.from(str);
        let crc = 0xffffffffffffffffn;
    
        for (let byte of bytes) {
            let idx = (new Number(crc >> 56n) ^ byte) & 0xFF;
            crc = this.crc64_table[idx] ^ ((crc << 8n) & 0xffffffffffffffffn);
        }

        return crc;
    }

    calculateHex(str) {
        return this.calculate(str).toString(16);
    }
}

module.exports = new CRC64();