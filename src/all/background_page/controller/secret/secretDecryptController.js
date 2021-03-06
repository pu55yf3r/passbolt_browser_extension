/**
 * Passbolt ~ Open source password manager for teams
 * Copyright (c) Passbolt SA (https://www.passbolt.com)
 *
 * Licensed under GNU Affero General Public License version 3 of the or any later version.
 * For full copyright and license information, please see the LICENSE.txt
 * Redistributions of files must retain the above copyright notice.
 *
 * @copyright     Copyright (c) Passbolt SA (https://www.passbolt.com)
 * @license       https://opensource.org/licenses/AGPL-3.0 AGPL License
 * @link          https://www.passbolt.com Passbolt(tm)
 * @since         2.8.0
 */
const {Crypto} = require('../../model/crypto');
const passphraseController = require('../passphrase/passphraseController');
const progressController = require('../progress/progressController');
const {LegacyResourceService} = require('../../service/resource');
const {Secret} = require('../../model/secret');

class SecretDecryptController {

  constructor(worker, requestId) {
    this.worker = worker;
    this.requestId = requestId;
  }

  /**
   * Execute the controller
   * @param {array} resourceId The resource identifier to decrypt the secret of.
   * @return {Promise}
   */
  async decrypt(resourceId) {
    const crypto = new Crypto();
    let passphrase;
    const secretPromise = this._getSecret(resourceId);

    // Capture the passphrase if needed
    try {
      passphrase = await passphraseController.get(this.worker);
    } catch(error) {
      this.worker.port.emit(this.requestId, 'ERROR', this.worker.port.getEmitableError(error));
      return;
    }

    try {
      await progressController.open(this.worker, 'Decrypting...', 2, "Decrypting private key");
      const secret = await secretPromise;
      const privateKey = await crypto.getAndDecryptPrivateKey(passphrase);
      await progressController.update(this.worker, 1, "Decrypting secret");
      const message = await crypto.decryptWithKey(secret.data, privateKey);
      await progressController.update(this.worker, 2, "Complete");
      this.worker.port.emit(this.requestId, 'SUCCESS', message);
      await progressController.close(this.worker);
    } catch (error) {
      console.error(error);
      this.worker.port.emit(this.requestId, 'ERROR', this.worker.port.getEmitableError(error));
      await progressController.close(this.worker);
    }
  }

  /**
   * Get the resource secret to decrypt
   * @param {string} resourceId The resource identifier to decrypt the secret of.
   * @return {Promise}
   */
  async _getSecret(resourceId) {
    let secret;
    try {
      secret = await Secret.findByResourceId(resourceId);
    } catch (error) {
      // Before v2.7.0, the secret entry point was not available.
      // Use the resource entry point to retrieve the secret.
      // @deprecated since v2.7.0 will be removed with v2.3.0
      const resource = await LegacyResourceService.findOne(resourceId, { contain: { secret: 1 } });
      secret = resource.secrets[0];
    }

    return secret;
  }
}

exports.SecretDecryptController = SecretDecryptController;
