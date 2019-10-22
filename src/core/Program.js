// TODO: upload empty texture if null ? maybe not
// TODO: upload identity matrix if null ?
// TODO: sampler Cube

let ID = 0;

// cache of typed arrays used to flatten uniform arrays
const arrayCacheF32 = {};

export class Program {
    constructor(gl, {
        vertex,
        fragment,
        uniforms = {},

        transparent = false,
        cullFace = gl.BACK,     //背面裁剪
        frontFace = gl.CCW,     //逆时针为背面
        depthTest = true,       //执行深度测试
        depthWrite = true,      //深度写入
        depthFunc = gl.LESS,    //深度较小的通过测试
    } = {}) {
        this.gl = gl;
        this.uniforms = uniforms;
        this.id = ID++;

        if (!vertex) console.warn('vertex shader not supplied');
        if (!fragment) console.warn('fragment shader not supplied');

        // Store program state
        //是否透明
        this.transparent = transparent;
        //裁剪面
        this.cullFace = cullFace;
        //指定正面判定方式
        this.frontFace = frontFace;
        //是否执行深度测试
        this.depthTest = depthTest;
        //是否写入深度
        this.depthWrite = depthWrite;
        //深度判定方式
        this.depthFunc = depthFunc;
        this.blendFunc = {};
        this.blendEquation = {};

        // set default blendFunc if transparent flagged
        //如果透明，且不使用源颜色
        if (this.transparent && !this.blendFunc.src) {
            //根据是否预乘背景alpha，指定相应的混合函数
            if (this.gl.renderer.premultipliedAlpha) this.setBlendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
            else this.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        }

        // compile vertex shader and log errors
        //创建VS
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        //绑定shader
        gl.shaderSource(vertexShader, vertex);
        //编译shader
        gl.compileShader(vertexShader);
        if (gl.getShaderInfoLog(vertexShader) !== '') {
            console.warn(`${gl.getShaderInfoLog(vertexShader)}\nVertex Shader\n${addLineNumbers(vertex)}`);
        }

        // compile fragment shader and log errors
        //创建FS
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        //绑定shader
        gl.shaderSource(fragmentShader, fragment);
        //编译shader
        gl.compileShader(fragmentShader);
        if (gl.getShaderInfoLog(fragmentShader) !== '') {
            console.warn(`${gl.getShaderInfoLog(fragmentShader)}\nFragment Shader\n${addLineNumbers(fragment)}`);
        }

        // compile program and log errors
        //创建程序对象
        this.program = gl.createProgram();
        //program与vs绑定
        gl.attachShader(this.program, vertexShader);
        //program与fs绑定
        gl.attachShader(this.program, fragmentShader);
        //指定program
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            return console.warn(gl.getProgramInfoLog(this.program));
        }

        // Remove shader once linked
        //移除shader
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        // Get active uniform locations
        //保存uniform变量的存储位置
        this.uniformLocations = new Map();

        //返回当前program中shader的uniform数量
        let numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let uIndex = 0; uIndex < numUniforms; uIndex++) {
            //根据索引获取uniform
            let uniform = gl.getActiveUniform(this.program, uIndex);
            this.uniformLocations.set(uniform, gl.getUniformLocation(this.program, uniform.name));

            // split uniforms' names to separate array and struct declarations
            const split = uniform.name.match(/(\w+)/g);

            uniform.uniformName = split[0];

            if (split.length === 3) {
                uniform.isStructArray = true;
                uniform.structIndex = Number(split[1]);
                uniform.structProperty = split[2];
            } else if (split.length === 2 && isNaN(Number(split[1]))) {
                uniform.isStruct = true;
                uniform.structProperty = split[1];
            }
        }

        // Get active attribute locations
        //保存attribute变量的存储位置
        this.attributeLocations = new Map();
        const locations = [];
        //获取当前激活的attribute变量的存储位置
        const numAttribs = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
        for (let aIndex = 0; aIndex < numAttribs; aIndex++) {
            //根据索引获取当前激活的attribute变量的信息
            const attribute = gl.getActiveAttrib(this.program, aIndex);
            //根据name获取attribute变量的存储位置
            const location = gl.getAttribLocation(this.program, attribute.name);
            locations[location] = attribute.name;
            //保存attribute变量的name与location
            this.attributeLocations.set(attribute.name, location);
        }
        this.attributeOrder = locations.join('');
    }

    setBlendFunc(src, dst, srcAlpha, dstAlpha) {
        this.blendFunc.src = src;
        this.blendFunc.dst = dst;
        this.blendFunc.srcAlpha = srcAlpha;
        this.blendFunc.dstAlpha = dstAlpha;
        if (src) this.transparent = true;
    }

    setBlendEquation(modeRGB, modeAlpha) {
        this.blendEquation.modeRGB = modeRGB;
        this.blendEquation.modeAlpha = modeAlpha;
    }

    applyState() {
        //如果执行深度测试，则开启深度测试功能，否则关闭
        if (this.depthTest) this.gl.renderer.enable(this.gl.DEPTH_TEST);
        else this.gl.renderer.disable(this.gl.DEPTH_TEST);

        //如果执行遮挡剔除，则开启遮挡剔除
        if (this.cullFace) this.gl.renderer.enable(this.gl.CULL_FACE);
        else this.gl.renderer.disable(this.gl.CULL_FACE);

        //是否开启混合
        if (this.blendFunc.src) this.gl.renderer.enable(this.gl.BLEND);
        else this.gl.renderer.disable(this.gl.BLEND);

        //如果执行隐藏面剔除，则设置剔除面
        if (this.cullFace) this.gl.renderer.setCullFace(this.cullFace);
        //设置正面
        this.gl.renderer.setFrontFace(this.frontFace);
        //深度写入
        this.gl.renderer.setDepthMask(this.depthWrite);
        //深度测试
        this.gl.renderer.setDepthFunc(this.depthFunc);

        //如果执行alpha混合
        if (this.blendFunc.src) this.gl.renderer.setBlendFunc(this.blendFunc.src, this.blendFunc.dst, this.blendFunc.srcAlpha, this.blendFunc.dstAlpha);
        if (this.blendEquation.modeRGB) this.gl.renderer.setBlendEquation(this.blendEquation.modeRGB, this.blendEquation.modeAlpha);
    }

    //告知webgl系统使用当前program
    use({
        flipFaces = false,
    } = {}) {
        let textureUnit = -1;
        //判断当前的program是否激活
        const programActive = this.gl.renderer.currentProgram === this.id;

        // Avoid gl call if program already in use
        //如果未激活
        if (!programActive) {
            //激活该program
            this.gl.useProgram(this.program);
            //记录当前的program对象
            this.gl.renderer.currentProgram = this.id;
        }

        // Set only the active uniforms found in the shader
        //遍历当前激活的uniform，并将这些值传入到webgl系统中
        this.uniformLocations.forEach((location, activeUniform) => {

            //获取当前uniform的name
            let name = activeUniform.uniformName;

            // get supplied uniform

            //获取当前的uniform
            let uniform = this.uniforms[name];

            // For structs, get the specific property instead of the entire object
            //如果当前uniform为结构体
            if (activeUniform.isStruct) {
                uniform = uniform[activeUniform.structProperty];
                name += `.${activeUniform.structProperty}`;
            }

            //如果是结构体数组
            if (activeUniform.isStructArray) {
                uniform = uniform[activeUniform.structIndex][activeUniform.structProperty];
                name += `[${activeUniform.structIndex}].${activeUniform.structProperty}`;
            }

            if (!uniform) {
                return warn(`Active uniform ${name} has not been supplied`);
            }

            if (uniform && uniform.value === undefined) {
                return warn(`${name} uniform is missing a value parameter`);
            }

            //如果当前的uniform为纹理对象
            if (uniform.value.texture) {
                //纹理单元数自加1
                textureUnit = textureUnit + 1;

                // Check if texture needs to be updated
                //执行纹理单元的update方法，判断是否需要更新
                uniform.value.update(textureUnit);
                //将uniform值传输到webgl中
                return setUniform(this.gl, activeUniform.type, location, textureUnit);
            }

            // For texture arrays, set uniform as an array of texture units instead of just one
            if (uniform.value.length && uniform.value[0].texture) {
                const textureUnits = [];
                uniform.value.forEach(value => {
                    textureUnit = textureUnit + 1;
                    value.update(textureUnit);
                    textureUnits.push(textureUnit);
                });

                return setUniform(this.gl, activeUniform.type, location, textureUnits);
            }

            //设置uniform值
            setUniform(this.gl, activeUniform.type, location, uniform.value);
        });

        //更新状态
        this.applyState();

        //如果执行面反转
        if (flipFaces) this.gl.renderer.setFrontFace(this.frontFace === this.gl.CCW ? this.gl.CW : this.gl.CCW);
    }

    remove() {
        this.gl.deleteProgram(this.program);
    }
}

function setUniform(gl, type, location, value) {
    value = value.length ? flatten(value) : value;

    //根据location获取uniform值
    const setValue = gl.renderer.state.uniformLocations.get(location);

    // Avoid redundant uniform commands
    if (value.length) {
        if (setValue === undefined) {

            // clone array to store as cache
            gl.renderer.state.uniformLocations.set(location, value.slice(0));
        } else {
            if (arraysEqual(setValue, value)) return;

            // Update cached array values
            setValue.set ? setValue.set(value) : setArray(setValue, value);
            gl.renderer.state.uniformLocations.set(location, setValue);
        }
    } else {
        //如果当前值相等，则不需要更新
        if (setValue === value) return;

        //更新指定uniform的值
        gl.renderer.state.uniformLocations.set(location, value);
    }

    //根据数据类型，将数据传入shader中
    switch (type) {
        case 5126  : return value.length ? gl.uniform1fv(location, value) : gl.uniform1f(location, value); // FLOAT
        case 35664 : return gl.uniform2fv(location, value); // FLOAT_VEC2
        case 35665 : return gl.uniform3fv(location, value); // FLOAT_VEC3
        case 35666 : return gl.uniform4fv(location, value); // FLOAT_VEC4
        case 35670 : // BOOL
        case 5124  : // INT
        case 35678 : // SAMPLER_2D
        case 35680 : return value.length ? gl.uniform1iv(location, value) : gl.uniform1i(location, value); // SAMPLER_CUBE
        case 35671 : // BOOL_VEC2
        case 35667 : return gl.uniform2iv(location, value); // INT_VEC2
        case 35672 : // BOOL_VEC3
        case 35668 : return gl.uniform3iv(location, value); // INT_VEC3
        case 35673 : // BOOL_VEC4
        case 35669 : return gl.uniform4iv(location, value); // INT_VEC4
        case 35674 : return gl.uniformMatrix2fv(location, false, value); // FLOAT_MAT2
        case 35675 : return gl.uniformMatrix3fv(location, false, value); // FLOAT_MAT3
        case 35676 : return gl.uniformMatrix4fv(location, false, value); // FLOAT_MAT4
    }
}

function addLineNumbers(string) {
    let lines = string.split('\n');
    for (let i = 0; i < lines.length; i ++) {
        lines[i] = (i + 1) + ': ' + lines[i];
    }
    return lines.join('\n');
}

function flatten(a) {
    const arrayLen = a.length;
    const valueLen = a[0].length;
    if (valueLen === undefined) return a;
    const length = arrayLen * valueLen;
    let value = arrayCacheF32[length];
    if (!value) arrayCacheF32[length] = value = new Float32Array(length);
    for (let i = 0; i < arrayLen; i++) value.set(a[i], i * valueLen);
    return value;
}

function arraysEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0, l = a.length; i < l; i ++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function setArray(a, b) {
    for (let i = 0, l = a.length; i < l; i ++) {
		a[i] = b[i];
	}
}

let warnCount = 0;
function warn(message) {
    if (warnCount > 100) return;
    console.warn(message);
    warnCount++;
    if (warnCount > 100) console.warn('More than 100 program warnings - stopping logs.');
}
