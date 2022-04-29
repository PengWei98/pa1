import { Func } from "mocha";
import { Program, Type, Expr, Literal, VarDef, FuncDef, Stmt, BinOp, UniOp, ClassDef } from "./ast";

type TypeEnv = {
    vars: Map<string, Type>,
    funcs: Map<string, [Type[], Type]>,
    classes: Map<string, ClassDef<Type>>,
    retType: Type
}

export function typeCheckProgram(program: Program<null>): Program<Type> {
    const env = {vars: new Map<string, Type>(), funcs: new Map<string, [Type[], Type]>(), classes: new Map<string, ClassDef<Type>>(), retType: "none" as Type}

    const typedVars = typeCheckVarDefs(program.vardefs, env);
    const typedFuncs: FuncDef<Type>[] = [];
    program.funcdefs.forEach((func) => {
        const typedDef = typeCheckFuncDef(func, env);
        typedFuncs.push(typedDef);
    })
    const typedClss: ClassDef<Type>[] = [];
    program.classdefs.forEach((cls) => {
        const typedCls = typeCheckClassDef(cls, env);
        typedClss.push(typedCls);
    })
    const typedStmts = typeCheckStmts(program.stmts, env);
    return { ...program, a: "none" as Type, vardefs: typedVars, funcdefs: typedFuncs, stmts: typedStmts, classdefs: typedClss}
}

export function typeCheckVarDefs(defs: VarDef<null>[], env: TypeEnv):VarDef<Type>[] {
    const typedDefs: VarDef<Type>[] = [];
    defs.forEach((def) => {
        const typedDef = typeCheckLiteral(def.literal);
        // check assginable
        if (typedDef.a !== def.typedvar.type && typedDef.a !== "none") {
            throw new Error("TYPE ERROR");
        }
        env.vars.set(def.typedvar.name, def.typedvar.type);
        const typedvar = {...def.typedvar, a: def.typedvar.type};
        typedDefs.push({...def, typedvar: typedvar, a: def.typedvar.type});
    });
    return typedDefs;
}

export function typeCheckFuncDef(func: FuncDef<null>, env: TypeEnv): FuncDef<Type>{
    env.funcs.set(func.name, [func.params.map(params => params.type), func.ret]);
    // add all the global enviroment to the local environment
    const localEnv = {vars: new Map(env.vars), funcs: new Map(env.funcs), retType: env.retType, classes: env.classes};
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
    // todo: the a?
    return {...func, params: typedParams, vardefs: typedVars,  stmts: typedStmts};
}

export function typeCheckClassDef(cls: ClassDef<null>, env: TypeEnv): ClassDef<Type>{
    // env.classes.add(cls.name);
    env.classes.set(cls.name, cls);
    // add all the global enviroment to the local environment
    const localEnv = {vars: new Map(env.vars), funcs: new Map(env.funcs), retType: env.retType, classes: env.classes};

    // add all the variables which is initialized in the function to the localEnvs
    cls.vardefs.forEach(vardef => {
        localEnv.vars.set(vardef.typedvar.name, vardef.typedvar.type);
    })
    // localEnv.retType = {"tag": "object", "class": cls.name};
    const typedVars =  typeCheckVarDefs(cls.vardefs, localEnv);


    cls.methoddefs.forEach(methoddef => {
        methoddef.name = cls.name + "$" + methoddef.name;
        localEnv.funcs.set(cls.name + "$" + methoddef.name, [methoddef.params.map(params => params.type), methoddef.ret]);
    })

    const typedMethods: FuncDef<Type>[] = [];
    cls.methoddefs.forEach(methoddef => {
        const typedDef = typeCheckFuncDef(methoddef, env);
        typedMethods.push(typedDef);
    });

    // localEnv.retType = func.ret;
    // todo: check all the paths have the right return value
    // const typedStmts = typeCheckStmts(func.stmts, localEnv);
    // todo: the a?
    return {...cls, vardefs: typedVars, methoddefs: typedMethods, a: {tag: "object", class: cls.name}};
}

export function typeCheckStmts(stmts: Stmt<null>[], env: TypeEnv): Stmt<Type>[] {
    const typedStmts : Stmt<Type>[] = [];
    stmts.forEach(stmt => {
        switch(stmt.tag) {
            case "assign":
                if (!env.vars.has(stmt.name)){
                    throw new Error("REFERENCE ERROR");
                }
                const typedValue = typeCheckExpr(stmt.value, env);
                // if (typedValue.a !== env.vars.get(stmt.name) ){
                //     throw new Error("TYPE ERROR")
                // }
                typedStmts.push({...stmt, value: typedValue, a: "none" as Type});
                break;
            case "memberAssign":
                const typedMember = typeCheckExpr(stmt.member, env);
                if (typedMember.tag !== "classVar"){
                    throw new Error("TYPE ERROR");
                }
                const typedMemberValue = typeCheckExpr(stmt.value, env);
                if ((typedMember.a as any).class !== (typedMemberValue.a as any).class && typedMember.a !== "none"){
                    throw new Error("TYPE ERROR");
                }
                typedStmts.push({...stmt, member: typedMember, value: typedMemberValue, a: "none" as Type})
                break;
            case "return":
                const typedRet = typeCheckExpr(stmt.ret, env);
                if (env.retType !== typedRet.a && (env.retType as any).class !== (typedRet.a as any).class && typedRet.a !== "none"){
                    throw new Error("TYPE ERROR");
                }
                typedStmts.push({...stmt, ret: typedRet});
                break;
            case "pass":
                typedStmts.push({...stmt, a: "none" as Type});
                break;
            case "expr":
                const typedExpr = typeCheckExpr(stmt.expr, env);
                typedStmts.push({...stmt, expr: typedExpr, a: typedExpr.a})
                break;
            case "if":
                const typedIfCond = typeCheckExpr(stmt.cond, env);
                if (typedIfCond.a !== "bool" as Type){
                    throw new Error("TYPE ERROR: the condition should be bool");
                }
                const typedIfStmts = typeCheckStmts(stmt.ifStmts, env);
                const typedElseStmts = typeCheckStmts(stmt.elseStmts, env);
                typedStmts.push({...stmt, cond: typedIfCond, ifStmts: typedIfStmts, elseStmts: typedElseStmts, a: "none" as Type});
                break;
            case "while":
                const typedWhileCond = typeCheckExpr(stmt.cond, env);
                if (typedWhileCond.a !== "bool" as Type){
                    throw new Error("TYPE ERROR: the condition should be bool");
                }
                const typedWhileStmts = typeCheckStmts(stmt.stmts, env);
                typedStmts.push({...stmt, cond: typedWhileCond, stmts: typedWhileStmts, a: "none" as Type});
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
                if (typedArg1.a === "int" as Type) {
                    return { ...expr, name: "print_num", a: "none" as Type, arg: typedArg1};
                } else if (typedArg1.a === "bool" as Type) {
                    return { ...expr, name: "print_bool", a: "none" as Type, arg: typedArg1};
                } else {
                    return { ...expr, name: "print_none", a: "none" as Type, arg: typedArg1};
                }
            }else if (expr.name === "abs"){
                return { ...expr, a: "int" as Type, arg: typedArg1};
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
                    if (left.a !== "int" as Type || right.a !== "int" as Type) {
                        throw new Error("TYPE ERROR: the type of the two operators are different");
                    }
                    return { ... expr, left: left, right: right, a: "int" as Type};
                case BinOp.GTE:
                case BinOp.LTE:
                case BinOp.GT:
                case BinOp.LT:
                    if (left.a !== "int" as Type || right.a !== "int" as Type) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, left: left, right: right, a: "bool" as Type};
                case BinOp.Eq:
                case BinOp.NE:
                    if (left.a !== right.a) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, left: left, right: right, a: "bool" as Type};
                case BinOp.Is:
                    return { ... expr, left: left, right: right, a: "bool" as Type};
            }
        case "UniOp":
            const arg = typeCheckExpr(expr.arg, env);
            switch(expr.op){
                case UniOp.Not:
                    if (arg.a !== "bool" as Type) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, arg, a: "bool" as Type};
                case UniOp.UMinus:
                    if (arg.a !== "int" as Type) {
                        throw new Error("TYPE ERROR");
                    }
                    return { ... expr, arg, a: "int" as Type};
            }
        case "call":
            console.log('incalll')
            if (env.funcs.has(expr.name)){
                // throw new Error("REFERENCE ERROR: the function is not defined");
                if (expr.args.length !== env.funcs.get(expr.name)[0].length){
                    throw new Error("TYPE ERROR: the number of the param is wrong");
                }
                const typedArgs = expr.args.map((arg) => typeCheckExpr(arg, env));
                typedArgs.forEach((typedArg, i) => {
                    if (typedArg.a !== env.funcs.get(expr.name)[0][i]){
                        throw new Error("TYPE ERROR: the type of the param is wrong");
                    }
                })
                console.log('typeargs')
                console.log(typedArgs)
                return {...expr, args: typedArgs, a: env.funcs.get(expr.name)[1], isFunc: true}
            }
            else if (env.classes.has(expr.name)){
                console.log('2way')
                return {...expr, args: [], a: {tag: "object", class: expr.name}, isFunc: false}
            }
            else {
                throw new Error("REFERENCE ERROR: the function or class name is not defined");
            }
        case "classVar":
            var typedObj = typeCheckExpr(expr.objName, env);
            if (!typedObj.a?.valueOf()?.hasOwnProperty("tag")){
                throw new Error("TYPE ERROR: the variable is not an object");
            }
            var className: string = (typedObj.a?.valueOf() as any).class;
            var vars = env.classes.get(className).vardefs.filter((vardef) => vardef.typedvar.name === expr.varName);
            if (vars.length === 0){
                throw new Error("REFERENCE ERROR: no such a field");
            }
            return {...expr, a: vars[0].typedvar.type, objName: typedObj}
        case "classMethod":
            // { a ?: A, tag: "classMethod", objName: Expr<A>, methodName: string, args: Expr<A>[]}
            
            var typedObj = typeCheckExpr(expr.objName, env);
            if (!typedObj.a?.valueOf()?.hasOwnProperty("tag")){
                throw new Error("TYPE ERROR: the variable is not an object");
            }
            var className: string = (typedObj.a?.valueOf() as any).class;
            var methods = env.classes.get(className).methoddefs.filter((methoddef) => methoddef.name === className + "$" + expr.methodName);
            if (methods.length === 0){
                throw new Error("REFERENCE ERROR: no such a method in the class");
            }
            const typedArgs = expr.args.map((arg) => typeCheckExpr(arg, env));
            // typedArgs.forEach((typedArg, i) => {
            //     console.log('!!!!!')
            //     console.log(typedArg.a)
            //     console.log(env.classes.get(className).methoddefs[i].a)
            //     if (typedArg.a !== env.classes.get(className).methoddefs[i].a){
            //         throw new Error("TYPE ERROR: the type of the param is wrong");
            //     }
            // })
            return {...expr, objName: typedObj, methodName: methods[0].name, a: methods[0].ret, args: typedArgs}
        default: 
            return expr;
    }
}

export function typeCheckLiteral(literal: Literal<null>): Literal<Type> {
    switch (literal.tag) {
        case "num":
            return { ...literal, a: "int" as Type}
        case "bool":
            return { ...literal, a: "bool" as Type}
        case "none":
            return { ...literal, a: "none" as Type}
    }
}