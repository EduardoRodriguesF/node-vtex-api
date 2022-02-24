import { IncomingMessage } from 'http'
import * as mime from 'mime-types'
import { basename } from 'path'
import { Readable } from 'stream'
import { createGzip } from 'zlib'

import { InstanceOptions, IOContext } from './HttpClient'
import { IgnoreNotFoundRequestConfig } from './HttpClient/middlewares/notFound'
import { forWorkspace, IODataSource } from './IODataSource'
import { BucketMetadata, FileListItem } from './responses'

const appId = process.env.VTEX_APP_ID
const [runningAppName] = appId ? appId.split('@') : ['']

const routes = {
  Bucket: (bucket: string) => `/buckets/${runningAppName}/${bucket}`,
  File: (bucket: string, path: string) => `${routes.Bucket(bucket)}/files/${path}`,
  Files: (bucket: string) => `${routes.Bucket(bucket)}/files`,
}

const isVBaseOptions = (opts?: string | VBaseOptions): opts is VBaseOptions => {
  return typeof opts !== 'string' && !(opts instanceof String)
}

export class VBase extends IODataSource {
  protected httpClientFactory = forWorkspace
  protected service = 'vbase'

  constructor (context?: IOContext, options: InstanceOptions = {}) {
    super(context, options)
    if (runningAppName === '') {
      throw new Error(`Invalid path to access Vbase. Variable VTEX_APP_ID is not available.`)
    }
  }

  public getBucket = (bucket: string) => {
    return this.http.get<BucketMetadata>(routes.Bucket(bucket))
  }

  public resetBucket = (bucket: string) => {
    return this.http.delete(routes.Files(bucket))
  }

  public listFiles = (bucket: string, opts?: string | VBaseOptions) => {
    let params: VBaseOptions = {}
    if (isVBaseOptions(opts)) {
      params = opts
    } else if (opts) {
      params = {prefix: opts}
    }
    return this.http.get<BucketFileList>(routes.Files(bucket), {params})
  }

  public getFile = (bucket: string, path: string) => {
    return this.http.getBuffer(routes.File(bucket, path))
  }

  public getJSON = <T>(bucket: string, path: string, nullIfNotFound?: boolean) => {
    return this.http.get<T>(routes.File(bucket, path), {nullIfNotFound} as IgnoreNotFoundRequestConfig)
  }

  public getFileStream = (bucket: string, path: string): Promise<IncomingMessage> => {
    return this.http.getStream(routes.File(bucket, path))
  }

  public saveFile = (bucket: string, path: string, stream: Readable, gzip: boolean = true, ttl?: number) => {
    return this.saveContent(bucket, path, stream, {gzip, ttl})
  }

  public saveJSON = <T>(bucket: string, path: string, data: T) => {
    const headers = {'Content-Type': 'application/json'}
    return this.http.put(routes.File(bucket, path), data, {headers})
  }

  public saveZippedContent = (bucket: string, path: string, stream: Readable) => {
    return this.saveContent(bucket, path, stream, {unzip: true})
  }

  public deleteFile = (bucket: string, path: string) => {
    return this.http.delete(routes.File(bucket, path))
  }

  private saveContent = (bucket: string, path: string, stream: Readable, opts: VBaseSaveOptions = {}) => {
    if (!stream.pipe || !stream.on) {
      throw new Error(`Argument stream must be a readable stream`)
    }
    const params = opts.unzip ? {unzip: opts.unzip} : {}
    const headers: Headers = {}

    let finalStream = stream
    headers['Content-Type'] = mime.contentType(basename(path)) || 'application/octet-stream'
    if (opts.gzip) {
      headers['Content-Encoding'] = 'gzip'
      finalStream = stream.pipe(createGzip())
    }
    if (opts.ttl && Number.isInteger(opts.ttl)) {
      headers['X-VTEX-TTL'] = opts.ttl
    }
    return this.http.put(routes.File(bucket, path), finalStream, {headers, params})
  }
}

interface Headers { [key: string]: string | number }

export interface BucketFileList {
  data: FileListItem[],
  next: string,
  smartCacheHeaders: any,
}

export interface VBaseOptions {
  prefix?: string,
  _next?: string,
  _limit?: number,
}

export interface VBaseSaveOptions {
  gzip?: boolean,
  unzip?: boolean,
  ttl?: number,
}