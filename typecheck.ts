import { Func } from "mocha";
import { Program, Type, Expr, Literal, VarDef, FuncDef, Stmt, BinOp, UniOp } from "./ast";

type TypeEnv = {
    vars: Map<string, Type>,
    funcs: Map<string, [Type[], Type]>,
    retType: Type
}

export function typeCheckProgram(program: Program<null>): Program<Type> {
    const env = {vars: new Map<string, Type>(), funcs: new Map<string, [Type[], Type]>(), retType: Type.none}

    const typedVars = typeCheckVarDefs(program.vardefs, env);
    const typedFuncs: FuncDef<Type>[] = [];
    program.funcdefs.forEach((func) => {
        const typedDef = typeCheckFuncDef(func, env)
        typedFuncs.push(typedDef);
    })
    const typedStmts = typeCheckStmts(program.stmts, env);
    console.log({ ...program, a: Type.none, vardefs: typedVars, funcdefs: typedFuncs, stmts: typedStmts});
    return { ...program, a: Type.none, vardefs: typedVars, funcdefs: typedFuncs, stmts: typedStmts}
}

export function typeCheckVarDefs(defs: VarDef<null>[], env: TypeEnv):VarDef<Type>[] {
    const typedDefs: VarDef<Type>[] = [];
    defs.forEach((def) => {
        const typedDef = typeCheckLiteral(def.literal);
        if (typedDef.a !== def.typedvar.type) {
            throw new Error("TYPE ERROR");
        }
        env.vars.set(def.typedvar.name, typedDef.a);
        const typedvar = {...def.typedvar, a: typedDef.a}
        typedDefs.push({...def, typedvar: typedvar, a: typedDef.a});
    });
    return typedDefs;
}

export function typeCheckFuncDef(func: FuncDef<null>, env: TypeEnv): FuncDef<Type>{
    env.funcs.set(func.name, [func.params.map(params => params.type), func.ret]);
    // add all the global enviroment to the local environment
    const localEnv = {vars: new Map(env.vars), funcs: new Map(env.funcs), retType: env.retType};
    // add all the parameters to the localEnvs
    func.params.forEach(param => {
        localEnv.vars.set(param.name, param.type);
    });
    const typedParams = func.params.map(param => {
        return {...param, a: param.type};
    })
    // add all the variables which is initialized in the function to the localEnvs
    const typedVars =  typeCheckVarDefs(func.vardefs, localEnv);

    // add the function to the localEnv
    localEnv.funcs.set(func.name, [func.params.map(params => params.type), func.ret]);
    localEnv.retType = func.ret;
    // todo: check all the paths have the right return value
    const typedStmts = typeCheckStmts(func.stmts, localEnv);
    return {...func, params: typedParams, vardefs: typedVars,  stmts: typedStmts};
}



export function typeCheckStmts(stmts: Stmt<null>[], env: TypeEnv): Stmt<Type>[] {
    const typedStmts : Stmt<Type>[] = [];
    stmts.forEach(stmt => {
        switch(stmt.tag) {
            case "assign":
                if (!env.vars.has(stmt.name)){
                    throw new Error("REFERENCE ERROR")
                }
                const typedValue = typeCheckExpr(stmt.value, env);
                if (typedValue.a !== env.vars.get(stmt.name)){
                    throw new Error("TYPE ERROR")
                }
                typedStmts.push({...stmt, value: typedValue, a: Type.none});
                break;
            case "return":
                const typedRet = typeCheckExpr(stmt.ret, env);
                if (env.retType !== typedRet.a){
                    throw new Error("TYPE ERROR");
                }
                typedStmts.push({...stmt, ret: typedRet});
                break;
            case "pass":
                typedStmts.push({...stmt, a: Type.none});
                break;
            case "expr":
                const typedExpr = typeCheckExpr(stmt.expr, env);
                typedStmts.push({...stmt, expr: typedExpr, a: typedExpr.a})
                break;
            case "if":
                const typedIfCond = typeCheckExpr(stmt.cond, env);
                if (typedIfCond.a !== Type.bool){
                    throw new Error("TYPE ERROR: the condition should be bool");
                }
                const typedIfStmts = typeCheckStmts(stmt.ifStmts, env);
                const typedElseStmts = typeCheckStmts(stmt.elseStmts, env);
                typedStmts.push({...stmt, cond: typedIfCond, ifStmts: typedIfStmts, elseStmts: typedElseStmts, a: Type.none});
                break;
            case "while":
                const typedWhileCond = typeCheckExpr(stmt.cond, env);
                if (typedWhileCond.a !== Type.bool){
                    throw new Error("TYPE ERROR: the condition should be bool");
                }
                const typedWhileStmts = typeCheckStmts(stmt.stmts, env);
                typedStmts.push({...stmt, cond: typedWhileCond, stmts: typedWhileStmts, a: Type.none});
                break;
        }
    });
    return typedStmts;
}



export function typeCheckExpr(expr: Expr<null>, env: TypeEnv): Expr<Type>{
    switch (expr.tag) {
        case "literal":
            const lit = typeCheckLiteral(expr.literal);
            return { ...expr, a: lit.a}
        case "id":
            // catch reference error
            if (!env.vars.has(expr.name)){
                throw new Error("REFERENCE ERROR");
            }
            const idType = env.vars.get(expr.name);
            return {  ...expr, a: idType};
        case "builtin1":
            const arg1 = expr.arg;
            const typedArg1 = typeCheckExpr(arg1, env);
            if (expr.name === "print"){
                if (typedArg1.a === Type.int) {
                    return { ...expr, name: "print_num", a: Type.none, arg: typedArg1};
                } else if (typedArg1.a === Type.bool) {
                    return { ...expr, name: "print_bool", a: Type.none, arg: typedArg1};
                } else {
                    return { ...expr, name: "print_none", a: Type.none, arg: typedArg1};
                }
            }else if (expr.name === "abs"){
                return { ...expr, a: Type.int, arg: typedArg1};
            }else{
                throw new Error("REFERENCE ERROR");
            }
        case "binOp":
            const left = typeCheckExpr(expr.left, env);
            const right = typeCheckExpr(expr.right, env);
            switch(expr.op) {
                case BinOp.Plus:
                case BinOp.Minus:
                case BinOp.Mul:
                case BinOp.Div:
                case BinOp.Mod:
                    if (left.a !== Type.int || right.a !== Type.int) {
                        throw new Error("TYPE ERROR: the type of the two operators are different");
                    }
                    return { ... expr, left: left, right: right, a: Type.int};
                case BinOp.GTE:
                case BinOp.LTE:
                case BinOp.GT:
                case BinOp.LT:
                    if (left.a !== Type.int || right.a !== Type.int) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, left: left, right: right, a: Type.bool};
                case BinOp.Eq:
                case BinOp.NE:
                    if (left.a !== right.a) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, left: left, right: right, a: Type.bool};
                case BinOp.Is:
                    return { ... expr, left: left, right: right, a: Type.bool};
            }
        case "UniOp":
            const arg = typeCheckExpr(expr.arg, env);
            switch(expr.op){
                case UniOp.Not:
                    if (arg.a !== Type.bool) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, arg, a: Type.bool};
                case UniOp.UMinus:
                    if (arg.a !== Type.int) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, arg, a: Type.int};
            }
        case "call":
            if (!env.funcs.has(expr.name)){
                throw new Error("REFERENCE ERROR: the function is not defined");
            }
            if (expr.args.length !== env.funcs.get(expr.name)[0].length){
                throw new Error("TYPE ERROR: the number of the param is wrong");
            }
            const typedArgs = expr.args.map((arg) => typeCheckExpr(arg, env));
            typedArgs.forEach((typedArg, i) => {
                if (typedArg.a !== env.funcs.get(expr.name)[0][i]){
                    throw new Error("TYPE ERROR: the type of the param is wrong");
                }
            })
            return {...expr, args: typedArgs, a: env.funcs.get(expr.name)[1]}
        default: 
            return expr;
    }
}

export function typeCheckLiteral(literal: Literal<null>): Literal<Type> {
    switch (literal.tag) {
        case "num":
            return { ...literal, a: Type.int}
        case "bool":
            return { ...literal, a: Type.bool}
        case "none":
            return { ...literal, a: Type.none}
    }
}