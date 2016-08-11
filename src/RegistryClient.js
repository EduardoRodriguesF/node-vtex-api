import FormData from 'form-data'
import Promise from 'any-promise'
import qs from 'querystring'
import {createReadStream} from 'fs'
import request, {successful} from './http'
import getEndpointUrl from './utils/appsEndpoints.js'
import checkRequiredParameters from './utils/required.js'

class RegistryClient {
  constructor ({authToken, userAgent, endpointUrl = getEndpointUrl('STABLE')}) {
    checkRequiredParameters({authToken, userAgent})
    this.authToken = authToken
    this.endpointUrl = endpointUrl === 'BETA'
      ? getEndpointUrl(endpointUrl)
      : endpointUrl
    this.userAgent = userAgent
    this.headers = {
      authorization: `token ${this.authToken}`,
      'user-agent': this.userAgent,
    }
    this.http = request.defaults({
      headers: this.headers,
    })
  }

  publishApp (account, workspace, zip, pre = false) {
    checkRequiredParameters({account, workspace, zip})
    const [protocol, host] = this.endpointUrl.split('//')
    const path = `${this.routes.Registry(account, workspace)}?${qs.stringify({isPreRelease: pre})}`
    const form = new FormData()
    form.append('zip', (typeof zip === 'string' || zip instanceof String) ? createReadStream(zip) : zip)
    return new Promise((resolve, reject) => {
      form.submit({
        protocol,
        host,
        path,
        headers: this.headers,
      }, (err, res) => {
        if (err) {
          return reject(err)
        }
        // Publish response has an empty payload, no need to read stream.
        if (!successful(res.statusCode)) {
          return reject(res)
        }
        resolve(res)
      })
    })
  }

  publishAppPatch (account, workspace, vendor, name, version, changes) {
    checkRequiredParameters({account, workspace, vendor, name, version, changes})
    const url = `${this.endpointUrl}${this.routes.RegistryAppVersion(account, workspace, vendor, name, version)}`

    return this.http.patch(url).send(changes).json()
  }

  listVendors (account, workspace) {
    checkRequiredParameters({account, workspace})
    const url = `${this.endpointUrl}${this.routes.Registry(account, workspace)}`

    return this.http.get(url).json()
  }

  listAppsByVendor (account, workspace, vendor) {
    checkRequiredParameters({account, workspace, vendor})
    const url = `${this.endpointUrl}${this.routes.RegistryVendor(account, workspace, vendor)}`

    return this.http.get(url).json()
  }

  listVersionsByApp (account, workspace, vendor, name, major = '') {
    checkRequiredParameters({account, workspace, vendor, name})
    const url = `${this.endpointUrl}${this.routes.RegistryApp(account, workspace, vendor, name)}`

    return request.get(url).query({major}).json()
  }

  getAppManifest (account, workspace, vendor, name, version) {
    checkRequiredParameters({account, workspace, vendor, name, version})
    const url = `${this.endpointUrl}${this.routes.RegistryVendor(account, workspace, vendor, name, version)}`

    return this.http.get(url).json()
  }

  unpublishApp (account, workspace, vendor, name, version) {
    checkRequiredParameters({account, workspace, vendor, name, version})
    const url = `${this.endpointUrl}${this.routes.RegistryVendor(account, workspace, vendor, name, version)}`

    return this.http.delete(url).json()
  }
}

RegistryClient.prototype.routes = {
  Registry (account, workspace) {
    return `/${account}/${workspace}/registry`
  },

  RegistryVendor (account, workspace, vendor) {
    return `${this.Registry(account, workspace)}/${vendor}/apps`
  },

  RegistryApp (account, workspace, vendor, name) {
    return `${this.RegistryVendor(account, workspace, vendor)}/${name}`
  },

  RegistryAppVersion (account, workspace, vendor, name, version) {
    return `${this.RegistryApp(account, workspace, vendor, name)}/${version}`
  },
}

export default RegistryClient
