// TODO: multi target rendering
// TODO: test stencil and depth
// TODO: destroy
// TODO: blit on resize?
import {Texture} from './Texture.js';

//创建一个离屏渲染对象
export class RenderTarget {
    constructor(gl, {
        width = gl.canvas.width,
        height = gl.canvas.height,
        target = gl.FRAMEBUFFER,    //需要绑定的目标
        color = 1, // number of color attachments 颜色
        depth = true,   //深度
        stencil = false,    //模板
        depthTexture = false, // note - stencil breaks
        wrapS = gl.CLAMP_TO_EDGE,   //边缘拉伸
        wrapT = gl.CLAMP_TO_EDGE,
        minFilter = gl.LINEAR,  //线性采样
        magFilter = minFilter,
        type = gl.UNSIGNED_BYTE,
        format = gl.RGBA,
        internalFormat = format,
        unpackAlignment,
        premultiplyAlpha,
    } = {}) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.depth = depth;
        //创建一个帧缓冲对象
        this.buffer = this.gl.createFramebuffer();
        this.target = target;
        //将帧缓冲对象绑定到target上
        this.gl.bindFramebuffer(this.target, this.buffer);

        this.textures = [];

        // TODO: multi target rendering
        // create and attach required num of color textures
        for (let i = 0; i < color; i++) {
            //创建纹理对象
            this.textures.push(new Texture(gl, {
                width, height,
                wrapS, wrapT, minFilter, magFilter, type, format, internalFormat, unpackAlignment, premultiplyAlpha,
                flipY: false,
                generateMipmaps: false,
            }));
            //载入纹理
            this.textures[i].update();

            //将纹理对象与FBO进行绑定
            this.gl.framebufferTexture2D(this.target, this.gl.COLOR_ATTACHMENT0 + i, this.gl.TEXTURE_2D, this.textures[i].texture, 0 /* level */);
        }

        // alias for majority of use cases
        this.texture = this.textures[0];

        // note depth textures break stencil - so can't use together
        if (depthTexture && (this.gl.renderer.isWebgl2 || this.gl.renderer.getExtension('WEBGL_depth_texture'))) {
            this.depthTexture = new Texture(gl, {
                width, height,
                minFilter: this.gl.NEAREST,
                magFilter: this.gl.NEAREST,
                format: this.gl.DEPTH_COMPONENT,
                internalFormat: gl.renderer.isWebgl2 ? this.gl.DEPTH_COMPONENT16 : this.gl.DEPTH_COMPONENT,
                type: this.gl.UNSIGNED_INT,
            });
            this.depthTexture.update();
            this.gl.framebufferTexture2D(this.target, this.gl.DEPTH_ATTACHMENT, this.gl.TEXTURE_2D, this.depthTexture.texture, 0 /* level */);
        } else {

            // Render buffers
            // 保存深度信息，但不保存模板信息
            if (depth && !stencil) {
                //创建一个渲染缓冲区
                this.depthBuffer = this.gl.createRenderbuffer();
                //绑定到target上
                this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthBuffer);
                this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, width, height);
                this.gl.framebufferRenderbuffer(this.target, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, this.depthBuffer);
            }

            if (stencil && !depth) {
                this.stencilBuffer = this.gl.createRenderbuffer();
                this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.stencilBuffer);
                this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.STENCIL_INDEX8, width, height);
                this.gl.framebufferRenderbuffer(this.target, this.gl.STENCIL_ATTACHMENT, this.gl.RENDERBUFFER, this.stencilBuffer);
            }

            if (depth && stencil) {
                this.depthStencilBuffer = this.gl.createRenderbuffer();
                this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthStencilBuffer);
                this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_STENCIL, width, height);
                this.gl.framebufferRenderbuffer(this.target, this.gl.DEPTH_STENCIL_ATTACHMENT, this.gl.RENDERBUFFER, this.depthStencilBuffer);
            }
        }

        this.gl.bindFramebuffer(this.target, null);
    }

}
