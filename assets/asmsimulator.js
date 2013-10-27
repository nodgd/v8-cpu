var app = angular.module('ASMSimulator', []);;app.service('assembler', ['opcodes', function(opcodes) {
    return {
        go: function(input) {
            var self = this;

            // Use https://www.debuggex.com/
            // Matches: "label: INSTRUCTION (["')OPERAND1(]"'), (["')OPERAND2(]"')
            // GROUPS:      1       2            3                 4
            var regex = /^[\t ]*(?:([.A-Za-z]\w*)[:])?(?:[\t ]*([A-Za-z]{2,4})(?:[\t ]+(\[\w+\]|\".+?\"|\'.+?\'|[.A-Za-z0-9]\w*)(?:[\t ]*[,][\t ]*(\[\w+\]|\".+?\"|\'.+?\'|[.A-Za-z0-9]\w*))?)?)?/;
            // MATCHES: "(+|-)INTEGER"
            var regexNum = /^[-+]?[0-9]+$/;
            // MATCHES: "(.L)abel"
            var regexLabel = /^[.A-Za-z]\w*$/;

            var code = [];
            var labels = {};
            var lines = input.split('\n'); // Split text into code lines

            // Allowed formats: 200, 200d, 0xA4, 0o48, 101b
            var parseNumber = function(input) {
                if (input.slice(0,2) === "0x") {
                    return parseInt(input.slice(2), 16);
                } else if (input.slice(0,2) === "0o") {
                    return parseInt(input.slice(2), 8);
                } else if (input.slice(input.length-1) === "b") {
                    return parseInt(input.slice(0, input.length-1), 2);
                } else if (input.slice(input.length-1) === "d") {
                    return parseInt(input.slice(0, input.length-1), 10);
                } else if (regexNum.exec(input)) {
                    return parseInt(input, 10);
                } else {
                    throw "Invalid number format";
                }
            };
            // Allowed registers: A, B, C, D
            var parseRegister = function(input) {
                input = input.toUpperCase();

                if (input === 'A') {
                    return 0;
                } else if (input === 'B') {
                    return 1;
                } else if (input === 'C') {
                    return 2;
                } else if (input === 'D') {
                    return 3;
                } else {
                    return undefined;
                }
            };
            // Allowed: Register, Label or Number
            var parseRegOrNumber = function(input, typeReg, typeNumber) {
                var register = parseRegister(input);

                if (register !== undefined) {
                    return { type: typeReg, value: register};
                } else {
                    var label = parseLabel(input);
                    if (label !== undefined) {
                        return { type: typeNumber, value: label};
                    } else {
                        var value = parseNumber(input);

                        if (isNaN(value)) {
                            throw "Not a " + typeNumber + ": " + value;
                        }
                        else if (value < 0 || value > 255)
                            throw typeNumber + " must have a value between 0-255";

                        return { type: typeNumber, value: value};
                    }
                }
            };
            // Allowed: Label
            var parseLabel = function(input) {
                if (regexLabel.exec(input)) {
                    return input.toUpperCase();
                } else {
                    return undefined;
                }
            };
            var getValue = function(input) {
                switch(input.slice(0,1)) {
                    case '[': // [number] or [register]
                        var address = input.slice(1,input.length-1);
                        return parseRegOrNumber(address, "regaddress", "address");
                    case '"': // "String"
                        var text = input.slice(1,input.length-1);
                        var chars = [];

                        for (var i = 0, l = text.length; i < l; i++) {
                            chars.push(text.charCodeAt(i));
                        }

                        return { type: "numbers", value: chars };
                    case "'": // 'C'
                        var character = input.slice(1,input.length-1);
                        if (character.length > 1)
                            throw "Only one character is allowed. Use String instead";

                        return { type: "number", value: character.charCodeAt(0) };
                    default: // REGISTER, NUMBER or LABEL
                        return parseRegOrNumber(input, "register", "number");
                }
            };
            var addLabel = function(label) {
                label = label.toUpperCase();
                if (label in labels)
                    throw "Duplicate label: " + label;

                if (label === "A" || label === "B" || label === "C" || label === "D")
                    throw "Label contains keyword: " + label;

                labels[label] = code.length;
            };

            for(var i = 0, l = lines.length; i < l; i++) {
                try {
                    var match = regex.exec(lines[i]);
                    if (match) {
                        if (match[1] !== undefined) {
                            addLabel(match[1]);
                        }

                        if (match[2] !== undefined) {
                            var instr = match[2].toUpperCase();
                            var p1, p2, opCode;

                            switch(instr) {
                                case 'DB':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "number")
                                        code.push(p1.value);
                                    else if (p1.type === "numbers")
                                        for (var j = 0, k = p1.value.length; j < k; j++) {
                                            code.push(p1.value[j]);
                                        }
                                    else
                                        throw "DB does not support this operand";

                                    break;
                                case 'MOV':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);
                                    
                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.MOV_REG_TO_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.MOV_ADDRESS_TO_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.MOV_REGADDRESS_TO_REG;
                                    else if (p1.type === "address" && p2.type === "register")
                                        opCode = opcodes.MOV_REG_TO_ADDRESS;
                                    else if (p1.type === "regaddress" && p2.type === "register")
                                        opCode = opcodes.MOV_REG_TO_REGADDRESS;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.MOV_NUMBER_TO_REG;
                                    else if (p1.type === "address" && p2.type === "number")
                                        opCode = opcodes.MOV_NUMBER_TO_ADDRESS;
                                    else if (p1.type === "regaddress" && p2.type === "number")
                                        opCode = opcodes.MOV_NUMBER_TO_REGADDRESS;
                                    else
                                        throw "MOV does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'ADD':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.ADD_REG_TO_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.ADD_REGADDRESS_TO_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.ADD_ADDRESS_TO_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.ADD_NUMBER_TO_REG;
                                    else
                                        throw "ADD does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'SUB':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.SUB_REG_FROM_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.SUB_REGADDRESS_FROM_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.SUB_ADDRESS_FROM_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.SUB_NUMBER_FROM_REG;
                                    else
                                        throw "SUB does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'INC':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.INC_REG;
                                    else
                                        throw "INC does not support this operand";

                                    code.push(opCode, p1.value);

                                    break;
                                case 'DEC':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.DEC_REG;
                                    else
                                        throw "DEC does not support this operand";

                                    code.push(opCode, p1.value);

                                    break;
                                case 'CMP':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.CMP_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.CMP_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.CMP_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.CMP_NUMBER_WITH_REG;
                                    else
                                        throw "CMP does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'JMP':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JMP_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JMP_ADDRESS;
                                    else
                                        throw "JMP does not support this operands";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JC':case 'JB':case 'JNAE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JC_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JC_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JNC':case 'JNB':case 'JAE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JNC_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JNC_ADDRESS;
                                    else
                                        throw instr + "does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JZ': case 'JE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JZ_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JZ_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JNZ': case 'JNE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JNZ_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JNZ_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JA': case 'JNBE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JA_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JA_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JNA': case 'JBE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JNA_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JNA_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'PUSH':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.PUSH_REG;
                                    else if (p1.type === "regaddress")
                                        opCode = opcodes.PUSH_REGADDRESS;
                                    else if (p1.type === "address")
                                        opCode = opcodes.PUSH_ADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.PUSH_NUMBER;
                                    else
                                        throw "PUSH does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'POP':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.POP_REG;
                                    else
                                        throw "PUSH does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'CALL':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.CALL_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.CALL_ADDRESS;
                                    else
                                        throw "CALL does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'RET':
                                    opCode = opcodes.RET;
                                    code.push(opCode);
                                    break;
                                case 'MUL':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.MUL_REG;
                                    else if (p1.type === "regaddress")
                                        opCode = opcodes.MUL_REGADDRESS;
                                    else if (p1.type === "address")
                                        opCode = opcodes.MUL_ADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.MUL_NUMBER;
                                    else
                                        throw "MULL does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'DIV':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.DIV_REG;
                                    if (p1.type === "regaddress")
                                        opCode = opcodes.DIV_REGADDRESS;
                                    if (p1.type === "address")
                                        opCode = opcodes.DIV_ADDRESS;
                                    if (p1.type === "number")
                                        opCode = opcodes.DIV_NUMBER;
                                    else
                                        throw "DIV does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'AND':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.AND_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.AND_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.AND_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.AND_NUMBER_WITH_REG;
                                    else
                                        throw "AND does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'OR':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.OR_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.OR_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.OR_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.OR_NUMBER_WITH_REG;
                                    else
                                        throw "OR does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'XOR':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.XOR_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.XOR_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.XOR_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.XOR_NUMBER_WITH_REG;
                                    else
                                        throw "XOR does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'NOT':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.NOT_REG;
                                    else
                                        throw "NOT does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'SHL':case 'SAL':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.SHL_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.SHL_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.SHL_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.SHL_NUMBER_WITH_REG;
                                    else
                                        throw instr + " does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'SHR': case 'SAR':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.SHR_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.SHR_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.SHR_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.SHR_NUMBER_WITH_REG;
                                    else
                                        throw instr + " does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                default:
                                    throw "Invalid instruction: " + match[2];
                            }
                        }
                    } else {
                        // Check if line starts with a comment otherwise the line contains an error and can not be parsed
                        if (lines[i].trim().slice(0,1) !== ";") {
                            throw "Syntax error";
                        }
                    }
                } catch(e) {
                    throw { error: e, line: i};
                }
            }

            // Replace label
            for(i = 0, l = code.length; i < l; i++) {
                if (!angular.isNumber(code[i])) {
                    if (code[i] in labels) {
                        code[i] = labels[code[i]];
                    } else {
                        throw "Undefined label: " + code[i];
                    }
                }
            }

            return code;
        }
    };
}]);;app.service('cpu', ['opcodes', 'memory', function(opcodes, memory) {
    var cpu = {
        step: function() {
            var self = this;

            if (self.fault === true) {
                throw "FAULT. Reset to continue.";
            }

            try {
                var checkGPR = function(reg) {
                    if (reg < 0 || reg >= self.gpr.length) {
                        throw "Invalid register: " + reg;
                    } else {
                        return reg;
                    }
                };
                var checkOperation = function(value) {
                    self.zero = false;
                    self.carry = false;

                    if (value >= 256) {
                        self.carry = true;
                        value = value % 256;
                    } else if (value === 0) {
                        self.zero = true;
                    } else if (value < 0) {
                        self.carry = true;
                        value = 255 - (-value) % 256;
                    }

                    return value;
                };
                var jump = function(newIP) {
                    if (newIP < 0 || newIP >= memory.data.length) {
                        throw "IP outside memory";
                    } else {
                        self.ip = newIP;
                    }
                };
                var push = function(value) {
                    memory.store(self.sp--, value);
                    if (self.sp < 0) {
                        throw "Stack overflow";
                    }
                };
                var pop = function() {
                    var value = memory.load(++self.sp);
                    if (self.sp > 231) {
                        throw "Stack underflow";
                    }

                    return value;
                };
                var division = function(divisor) {
                    if (divisor === 0) {
                        throw "Division by 0";
                    }

                    return Math.floor(self.gpr[0] / divisor);
                };

                if (self.ip < 0 || self.ip >= memory.data.length) {
                    throw "Instruction pointer is outside of memory";
                }
                
                var regTo, regFrom, memFrom, memTo, number;
                var instr = memory.load(self.ip);
                switch(instr) {
                    case opcodes.NONE:
                        return false; // Abort step
                    case opcodes.MOV_REG_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = self.gpr[regFrom];
                        self.ip++;
                        break;
                    case opcodes.MOV_ADDRESS_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = memory.load(memFrom);
                        self.ip++;
                        break;
                    case opcodes.MOV_REGADDRESS_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = memory.load(self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.MOV_REG_TO_ADDRESS:
                        memTo = memory.load(++self.ip);
                        regFrom = checkGPR(memory.load(++self.ip));
                        memory.store(memTo, self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.MOV_REG_TO_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        memory.store(self.gpr[regTo], self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.MOV_NUMBER_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = number;
                        self.ip++;
                        break;
                    case opcodes.MOV_NUMBER_TO_ADDRESS:
                        memTo = memory.load(++self.ip);
                        number = memory.load(++self.ip);
                        memory.store(memTo, number);
                        self.ip++;
                        break;
                    case opcodes.MOV_NUMBER_TO_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        memory.store(self.gpr[regTo], number);
                        self.ip++;
                        break;
                    case opcodes.ADD_REG_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] + self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.ADD_REGADDRESS_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] + memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.ADD_ADDRESS_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] + memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.ADD_NUMBER_TO_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] + number);
                        self.ip++;
                        break;
                    case opcodes.SUB_REG_FROM_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] - self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.SUB_REGADDRESS_FROM_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] - memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.SUB_ADDRESS_FROM_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] - memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.SUB_NUMBER_FROM_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] - number);
                        self.ip++;
                        break;
                    case opcodes.INC_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] + 1);
                        self.ip++;
                        break;
                    case opcodes.DEC_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] - 1);
                        self.ip++;
                        break;
                    case opcodes.CMP_REG_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        checkOperation(self.gpr[regTo] - self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.CMP_REGADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        checkOperation(self.gpr[regTo] - memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.CMP_ADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        checkOperation(self.gpr[regTo] - memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.CMP_NUMBER_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        checkOperation(self.gpr[regTo] - number);
                        self.ip++;
                        break;
                    case opcodes.JMP_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        jump(self.gpr[regTo]);
                        break;
                    case opcodes.JMP_ADDRESS:
                        number = memory.load(++self.ip);
                        jump(number);
                        break;
                    case opcodes.JC_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        if (self.carry) {
                            jump(self.gpr[regTo]);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JC_ADDRESS:
                        number = memory.load(++self.ip);
                        if (self.carry) {
                            jump(number);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JNC_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        if (!self.carry) {
                            jump(self.gpr[regTo]);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JNC_ADDRESS:
                        number = memory.load(++self.ip);
                        if (!self.carry) {
                            jump(number);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JZ_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        if (self.zero) {
                            jump(self.gpr[regTo]);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JZ_ADDRESS:
                        number = memory.load(++self.ip);
                        if (self.zero) {
                            jump(number);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JNZ_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        if (!self.zero) {
                            jump(self.gpr[regTo]);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JNZ_ADDRESS:
                        number = memory.load(++self.ip);
                        if (!self.zero) {
                            jump(number);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JA_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        if (!self.zero && !self.carry) {
                            jump(self.gpr[regTo]);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JA_ADDRESS:
                        number = memory.load(++self.ip);
                        if (!self.zero && !self.carry) {
                            jump(number);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JNA_REGADDRESS: // JNA REG
                        regTo = checkGPR(memory.load(++self.ip));
                        if (self.zero || self.carry) {
                            jump(self.gpr[regTo]);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.JNA_ADDRESS:
                        number = memory.load(++self.ip);
                        if (self.zero || self.carry) {
                            jump(number);
                        } else {
                            self.ip++;
                        }
                        break;
                    case opcodes.PUSH_REG:
                        regFrom = checkGPR(memory.load(++self.ip));
                        push(self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.PUSH_REGADDRESS:
                        regFrom = checkGPR(memory.load(++self.ip));
                        push(memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.PUSH_ADDRESS:
                        memFrom = memory.load(++self.ip);
                        push(memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.PUSH_NUMBER:
                        number = memory.load(++self.ip);
                        push(number);
                        self.ip++;
                        break;
                    case opcodes.POP_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = pop();
                        self.ip++;
                        break;
                    case opcodes.CALL_REGADDRESS:
                        regTo = checkGPR(memory.load(++self.ip));
                        push(self.ip+1);
                        jump(self.gpr[regTo]);
                        break;
                    case opcodes.CALL_ADDRESS:
                        number = memory.load(++self.ip);
                        push(self.ip+1);
                        jump(number);
                        break;
                    case opcodes.RET:
                        jump(pop());
                        break;
                    case opcodes.MUL_REG: // A = A * REG
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[0] = checkOperation(self.gpr[0] * self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.MUL_REGADDRESS: // A = A * [REG]
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[0] = checkOperation(self.gpr[0] * memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.MUL_ADDRESS: // A = A * [NUMBER]
                        memFrom = memory.load(++self.ip);
                        self.gpr[0] = checkOperation(self.gpr[0] * memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.MUL_NUMBER: // A = A * NUMBER
                        number = memory.load(++self.ip);
                        self.gpr[0] = checkOperation(self.gpr[0] * number);
                        self.ip++;
                        break;
                    case opcodes.DIV_REG: // A = A / REG
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[0] = checkOperation(division(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.DIV_REGADDRESS: // A = A / [REG]
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[0] = checkOperation(division(memory.load(self.gpr[regFrom])));
                        self.ip++;
                        break;
                    case opcodes.DIV_ADDRESS: // A = A / [NUMBER]
                        memFrom = memory.load(++self.ip);
                        self.gpr[0] = checkOperation(division(memory.load(memFrom)));
                        self.ip++;
                        break;
                    case opcodes.DIV_NUMBER: // A = A / NUMBER
                        number = memory.load(++self.ip);
                        self.gpr[0] = checkOperation(division(number));
                        self.ip++;
                        break;
                    case opcodes.AND_REG_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] & self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.AND_REGADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] & memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.AND_ADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] & memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.AND_NUMBER_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] & number);
                        self.ip++;
                        break;
                    case opcodes.OR_REG_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] | self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.OR_REGADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] | memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.OR_ADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] | memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.OR_NUMBER_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] | number);
                        self.ip++;
                        break;
                    case opcodes.XOR_REG_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] ^ self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.XOR_REGADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] ^ memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.XOR_ADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] ^ memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.XOR_NUMBER_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] ^ number);
                        self.ip++;
                        break;
                    case opcodes.NOT_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(~self.gpr[regTo]);
                        self.ip++;
                        break;
                    case opcodes.SHL_REG_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] << self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.SHL_REGADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] << memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.SHL_ADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] << memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.SHL_NUMBER_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] << number);
                        self.ip++;
                        break;
                    case opcodes.SHR_REG_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] >>> self.gpr[regFrom]);
                        self.ip++;
                        break;
                    case opcodes.SHR_REGADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        regFrom = checkGPR(memory.load(++self.ip));
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] >>> memory.load(self.gpr[regFrom]));
                        self.ip++;
                        break;
                    case opcodes.SHR_ADDRESS_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        memFrom = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] >>> memory.load(memFrom));
                        self.ip++;
                        break;
                    case opcodes.SHR_NUMBER_WITH_REG:
                        regTo = checkGPR(memory.load(++self.ip));
                        number = memory.load(++self.ip);
                        self.gpr[regTo] = checkOperation(self.gpr[regTo] >>> number);
                        self.ip++;
                        break;
                    default:
                        throw "Invalid op code: " + instr;
                }

                return true;
            } catch(e) {
                self.fault = true;
                throw e;
            }
        },
        reset: function() {
            var self = this;

            self.gpr = [0, 0, 0, 0];
            self.sp = 231;
            self.ip = 0;
            self.zero = false;
            self.carry = false;
            self.fault = false;
        }
    };

    cpu.reset();
    return cpu;
}]);;app.service('memory', [function() {
    var memory = {
        data: Array(256),
        lastAccess: -1,
        load: function(address) {
            var self = this;

            if (address < 0 || address >= self.data.length) {
                throw "Memory access violation at " + address;
            }

            self.lastAccess = address;
            return self.data[address];
        },
        store: function(address, value) {
            var self = this;

            if (address < 0 || address >= self.data.length) {
                throw "Memory access violation at " + address;
            }

            self.lastAccess = address;
            self.data[address] = value;
        },
        reset: function() {
            var self = this;

            self.lastAccess = -1;
            for (var i = 0, l = self.data.length; i < l; i++) {
                self.data[i] = 0;
            }
        }
    };

    memory.reset();
    return memory;
}]);;app.service('opcodes', [function() {
    var opcodes = {
        NONE: 0,
        MOV_REG_TO_REG: 1,
        MOV_ADDRESS_TO_REG: 2,
        MOV_REGADDRESS_TO_REG: 3,
        MOV_REG_TO_ADDRESS: 4,
        MOV_REG_TO_REGADDRESS: 5,
        MOV_NUMBER_TO_REG: 6,
        MOV_NUMBER_TO_ADDRESS: 7,
        MOV_NUMBER_TO_REGADDRESS: 8,
        ADD_REG_TO_REG: 10,
        ADD_REGADDRESS_TO_REG: 11,
        ADD_ADDRESS_TO_REG: 12,
        ADD_NUMBER_TO_REG: 13,
        SUB_REG_FROM_REG: 14,
        SUB_REGADDRESS_FROM_REG: 15,
        SUB_ADDRESS_FROM_REG: 16,
        SUB_NUMBER_FROM_REG: 17,
        INC_REG: 18,
        DEC_REG: 19,
        CMP_REG_WITH_REG: 20,
        CMP_REGADDRESS_WITH_REG: 21,
        CMP_ADDRESS_WITH_REG: 22,
        CMP_NUMBER_WITH_REG: 23,
        JMP_REGADDRESS: 30,
        JMP_ADDRESS: 31,
        JC_REGADDRESS: 32,
        JC_ADDRESS: 33,
        JNC_REGADDRESS: 34,
        JNC_ADDRESS: 35,
        JZ_REGADDRESS: 36,
        JZ_ADDRESS: 37,
        JNZ_REGADDRESS: 38,
        JNZ_ADDRESS: 39,
        JA_REGADDRESS: 40,
        JA_ADDRESS: 41,
        JNA_REGADDRESS: 42,
        JNA_ADDRESS: 43,
        PUSH_REG: 50,
        PUSH_REGADDRESS: 51,
        PUSH_ADDRESS: 52,
        PUSH_NUMBER: 53,
        POP_REG: 54,
        CALL_REGADDRESS: 55,
        CALL_ADDRESS: 56,
        RET: 57,
        MUL_REG: 60,
        MUL_REGADDRESS: 61,
        MUL_ADDRESS: 62,
        MUL_NUMBER: 63,
        DIV_REG: 64,
        DIV_REGADDRESS: 65,
        DIV_ADDRESS: 66,
        DIV_NUMBER: 67,
        AND_REG_WITH_REG: 70,
        AND_REGADDRESS_WITH_REG: 71,
        AND_ADDRESS_WITH_REG: 72,
        AND_NUMBER_WITH_REG: 73,
        OR_REG_WITH_REG: 74,
        OR_REGADDRESS_WITH_REG: 75,
        OR_ADDRESS_WITH_REG: 76,
        OR_NUMBER_WITH_REG: 77,
        XOR_REG_WITH_REG: 78,
        XOR_REGADDRESS_WITH_REG: 79,
        XOR_ADDRESS_WITH_REG: 80,
        XOR_NUMBER_WITH_REG: 81,
        NOT_REG: 82,
        SHL_REG_WITH_REG: 90,
        SHL_REGADDRESS_WITH_REG: 91,
        SHL_ADDRESS_WITH_REG: 92,
        SHL_NUMBER_WITH_REG: 93,
        SHR_REG_WITH_REG: 94,
        SHR_REGADDRESS_WITH_REG: 95,
        SHR_ADDRESS_WITH_REG: 96,
        SHR_NUMBER_WITH_REG: 97
    };

    return opcodes;
}]);;app.controller('Ctrl', ['$scope', '$timeout', 'cpu', 'memory', 'assembler', function($scope, $timeout, cpu, memory, assembler) {
    $scope.memory = memory;
    $scope.cpu = cpu;
    $scope.error = '';
    $scope.isRunning = false;
    $scope.displayHex = true;
    $scope.speeds = [{speed:1, desc:"1 HZ"}, {speed:4, desc:"4 HZ"}, {speed:8, desc:"8 HZ"}, {speed:16, desc:"16 HZ"}];
    $scope.speed = 4;

    $scope.code = "; Simple example\n; Writes Hello World to the output\n\n	JMP start\nhello: DB \"Hello World!\" ; Variable\n       DB 0	; String terminator\n\nstart:\n	MOV C, hello    ; Point to var \n	MOV D, 232	; Point to output\n	CALL print\n	DB 0		; Stop execution\n\nprint:			; print(C:*from, D:*to)\n	PUSH A\n	PUSH B\n	MOV B, 0\n.loop:\n	MOV A, [C]	; Get char from var\n	MOV [D], A	; Write to output\n	INC C\n	INC D  \n	CMP B, [C]	; Check if end\n	JNZ .loop	; jump if not\n\n	POP B\n	POP A\n	RET";

    $scope.reset = function() {
        cpu.reset();
        memory.reset();
        $scope.error = '';
        $scope.selectedLine = -1;
    };

    $scope.executeStep = function() {
        if (!$scope.checkPrgrmLoaded()) {
            $scope.assemble();
        }

        try {
            return cpu.step();
        } catch (e) {
            $scope.error = e;
            return false;
        }
    };

    var runner;
    $scope.run = function() {
        if (!$scope.checkPrgrmLoaded()) {
            $scope.assemble();
        }

        $scope.isRunning = true;
        runner = $timeout(function() {
            if ($scope.executeStep() === true) {
                $scope.run();
            } else {
                $scope.isRunning = false;
            }
        }, 1000 / $scope.speed);
    };

    $scope.stop = function() {
        $timeout.cancel(runner);
        $scope.isRunning = false;
    };

    $scope.checkPrgrmLoaded = function() {
        for (var i = 0, l = memory.data.length; i < l; i++) {
            if (memory.data[i] !== 0) {
                return true;
            }
        }

        return false;
    };

    $scope.getChar = function(value) {
        var text = String.fromCharCode(value);

        if (text.trim() === '') {
            return '\u00A0\u00A0';
        } else {
            return text;
        }
    };

    $scope.assemble = function() {
        try {
            $scope.reset();

            var binary = assembler.go($scope.code);
            if (binary.length > memory.data.length)
                throw "Binary code does not fit into the memory. Max " + memory.data.length + " bytes are allowed";

            for (var i = 0, l = binary.length; i < l; i++) {
                memory.data[i] = binary[i];
            }
        } catch (e) {
            $scope.error = e.line + " | " + e.error;
            $scope.selectedLine = e.line;
        }
    };
}]);;app.filter('flag', function() {
    return function(input) {
        return input.toString().toUpperCase();
    };
});;app.filter('number', function() {
    return function(input, isHex) {
        if (isHex) {
            var hex = input.toString(16).toUpperCase();
            return hex.length == 1 ? "0" + hex: hex;
        } else {
            return input.toString(10);
        }
    };
});;// Source: http://lostsource.com/2012/11/30/selecting-textarea-line.html
app.directive('selectLine', [function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs, controller) {
            scope.$watch('selectedLine', function() {
                if (scope.selectedLine >= 0) {
                    var lines = element[0].value.split("\n");

                    // Calculate start/end
                    var startPos = 0;
                    for(var x = 0; x < lines.length; x++) {
                        if(x == scope.selectedLine) {
                            break;
                        }
                        startPos += (lines[x].length+1);
                    }

                    var endPos = lines[scope.selectedLine].length+startPos;

                    // Chrome / Firefox
                    if(typeof(element[0].selectionStart) != "undefined") {
                        element[0].focus();
                        element[0].selectionStart = startPos;
                        element[0].selectionEnd = endPos;
                    }

                    // IE
                    if (document.selection && document.selection.createRange) {
                        element[0].focus();
                        element[0].select();
                        var range = document.selection.createRange();
                        range.collapse(true);
                        range.moveEnd("character", endPos);
                        range.moveStart("character", startPos);
                        range.select();
                    }
                }
            });
        }
    };
}]);;app.filter('startFrom', function() {
    return function(input, start) {
        start = +start; //parse to int
        return input.slice(start);
    };
});;app.directive('tabSupport', [function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs, controller) {
            element.bind("keydown", function (e) {
                if (e.keyCode === 9) {
                    var val = this.value;
                    var start = this.selectionStart;
                    var end = this.selectionEnd;

                    this.value = val.substring(0, start) + '\t' + val.substring(end);
                    this.selectionStart = this.selectionEnd = start + 1;

                    e.preventDefault();
                    return false;
                }
            });
        }
    };
}]);