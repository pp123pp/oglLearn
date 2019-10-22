// TODO: facilitate Compressed Textures
// TODO: delete texture
// TODO: should I support anisotropy? Maybe a way to extend the update easily
// TODO: check is ArrayBuffer.isView is best way to check for Typed Arrays?
// TODO: use texSubImage2D for updates
// TODO: need? encoding = linearEncoding

const emptyPixel = new Uint8Array(4);

function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

let ID = 0;

//创建纹理对象
export class Texture {
    constructor(gl, {
        image,
        target = gl.TEXTURE_2D,     //使用texture2D
        type = gl.UNSIGNED_BYTE,    //类型为无符号
        format = gl.RGBA,           //格式为RGBA
        internalFormat = format,
        wrapS = gl.CLAMP_TO_EDGE,   //横向边缘拉伸
        wrapT = gl.CLAMP_TO_EDGE,   //纵向边缘拉伸
        generateMipmaps = true,     //生成mipmap

        //设置缩小是的过滤方式 NEAREST_MIPMAP_LINEAR: 选取两个最近的mipmap，并通过NEAREST进行采样，最终结果为颜色的加权
        minFilter = generateMipmaps ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR,
        magFilter = gl.LINEAR,
        premultiplyAlpha = false,   //是否预乘背景alpha
        unpackAlignment = 4,    //分组的分量值，因为前面使用的是RGBA
        flipY = target == gl.TEXTURE_2D ? true : false,     //是否进行Y轴反转
        level = 0,
        width, // used for RenderTargets or Data Textures
        height = width,
    } = {}) {
        this.gl = gl;

        //系统纹理ID自加1
        this.id = ID++;

        //加载图片的image对象
        this.image = image;
        this.target = target;
        this.type = type;
        this.format = format;
        this.internalFormat = internalFormat;
        this.minFilter = minFilter;
        this.magFilter = magFilter;
        this.wrapS = wrapS;
        this.wrapT = wrapT;
        this.generateMipmaps = generateMipmaps;
        this.premultiplyAlpha = premultiplyAlpha;
        this.unpackAlignment = unpackAlignment;
        this.flipY = flipY;
        this.level = level;
        this.width = width;
        this.height = height;

        //创建纹理对象
        this.texture = this.gl.createTexture();

        this.store = {
            image: null,
        };

        // Alias for state store to avoid redundant calls for global state
        this.glState = this.gl.renderer.state;

        // State store to avoid redundant calls for per-texture state
        //保存纹理参数
        this.state = {};
        this.state.minFilter = this.gl.NEAREST_MIPMAP_LINEAR;
        this.state.magFilter = this.gl.LINEAR;
        this.state.wrapS = this.gl.REPEAT;
        this.state.wrapT = this.gl.REPEAT;
    }

    bind() {

        // Already bound to active texture unit
        if (this.glState.textureUnits[this.glState.activeTextureUnit] === this.id) return;
        //绑定纹理单元
        this.gl.bindTexture(this.target, this.texture);
        //将当前激活的纹理单元保存起来
        this.glState.textureUnits[this.glState.activeTextureUnit] = this.id;
    }

    update(textureUnit = 0) {
        //如果当前image对象未保存在store中
        const needsUpdate = !(this.image === this.store.image && !this.needsUpdate);

        // Make sure that texture is bound to its texture unit

        //如果当前纹理需要更新
        if (needsUpdate || this.glState.textureUnits[textureUnit] !== this.id) {

            //激活当前纹理单元
            // set active texture unit to perform texture functions
            this.gl.renderer.activeTexture(textureUnit);
            this.bind();
        }

        if (!needsUpdate) return;

        //将更新状态设置为false
        this.needsUpdate = false;

        //如果需要反转Y轴，但还未反转
        if (this.flipY !== this.glState.flipY) {
            //执行Y轴反转
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
            //更新状态
            this.glState.flipY = this.flipY;
        }

        //是否需要预乘alpha
        if (this.premultiplyAlpha !== this.glState.premultiplyAlpha) {
            //将图像的RGB的每一个分量 * alpha
            this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
            //更新状态
            this.glState.premultiplyAlpha = this.premultiplyAlpha;
        }

        //设定纹理的对齐值
        if (this.unpackAlignment !== this.glState.unpackAlignment) {
            this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, this.unpackAlignment);
            this.glState.unpackAlignment = this.unpackAlignment;
        }

        //设定缩小时的纹理参数
        if (this.minFilter !== this.state.minFilter) {
            this.gl.texParameteri(this.target, this.gl.TEXTURE_MIN_FILTER, this.minFilter);
            this.state.minFilter = this.minFilter;
        }

        //设定放大时的纹理参数
        if (this.magFilter !== this.state.magFilter) {
            this.gl.texParameteri(this.target, this.gl.TEXTURE_MAG_FILTER, this.magFilter);
            this.state.magFilter = this.magFilter;
        }

        //S方向上的贴图方式
        if (this.wrapS !== this.state.wrapS) {
            this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_S, this.wrapS);
            this.state.wrapS = this.wrapS;
        }

        //T方向的贴图方式
        if (this.wrapT !== this.state.wrapT) {
            this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_T, this.wrapT);
            this.state.wrapT = this.wrapT;
        }

        if (this.image) {
            if (this.image.width) {
                this.width = this.image.width;
                this.height = this.image.height;
            }

            //如果当前是cubeMap
            if (this.target === this.gl.TEXTURE_CUBE_MAP) {
                for (let i = 0; i < 6; i++) {
                    this.gl.texImage2D(this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, this.level, this.internalFormat, this.format, this.type, this.image[i]);
                }
            } else if (ArrayBuffer.isView(this.image)) {
                //将纹理赋值
                this.gl.texImage2D(this.target, this.level, this.internalFormat, this.width, this.height, 0, this.format, this.type, this.image);
            } else {
                this.gl.texImage2D(this.target, this.level, this.internalFormat, this.format, this.type, this.image);
            }

            //是否生成mipmap
            if (this.generateMipmaps) {

                // For WebGL1, if not a power of 2, turn off mips, set wrapping to clamp to edge and minFilter to linear
                //webgl1.0不支持非2的整数次幂的纹理
                if (!this.gl.renderer.isWebgl2 && (!isPowerOf2(this.image.width) || !isPowerOf2(this.image.height))) {
                    this.generateMipmaps = false;
                    this.wrapS = this.wrapT = this.gl.CLAMP_TO_EDGE;
                    this.minFilter = this.gl.LINEAR;
                } else {
                    //生成mipmap
                    this.gl.generateMipmap(this.target);
                }
            }
        } else {
            //如果当前是cubeMap
            if (this.target === this.gl.TEXTURE_CUBE_MAP) {

                // Upload empty pixel for each side while no image to avoid errors while image or video loading
                for (let i = 0; i < 6; i++) {
                    this.gl.texImage2D(this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, emptyPixel);
                }
            } else if (this.width) {

                // image intentionally left null for RenderTarget
                this.gl.texImage2D(this.target, this.level, this.internalFormat, this.width, this.height, 0, this.format, this.type, null);
            } else {

                // Upload empty pixel if no image to avoid errors while image or video loading
                this.gl.texImage2D(this.target, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, emptyPixel);
            }
        }
        //保存数据
        this.store.image = this.image;

        this.onUpdate && this.onUpdate();
    }
}