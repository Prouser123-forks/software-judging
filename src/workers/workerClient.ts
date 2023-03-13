import { Constants } from "../constants";
import { BoardInfo } from "../structs/vendor/boardInfo";
import { BuildInfo } from "../structs/vendor/buildInfo";
import { Version } from "../structs/vendor/version";

export class WorkerClient {
	private device: USBDevice = undefined;
	private interface: USBInterface = undefined;

	// 'Cached' items from vendor requests
	private version: Version;
	private buildInfo: BuildInfo;
	private boardInfo: BoardInfo;

	hasDevice() {
		return this.device != undefined;
	}

	hasOpenedDevice() {
		if (this.device != undefined) {
			return this.device.opened;
		} else {
			// Device is undefined, so cannot be opened.
			return false;
		}
	}

	getDevice() {
		return this.device;
	}

	getInterface() {
		return this.interface;
	}

	setDevice(device: USBDevice) {
		this.device = device;
	}

	setInterface(iface: USBInterface) {
		this.interface = iface;
	}

	// Assumes device is alraedy available
	findInterface() {
		const interfaces = this.device.configuration.interfaces;

		const matches = interfaces.filter(iface => {
			const matching = iface.alternate.endpoints.filter(
				endpoint => endpoint.endpointNumber == Constants.ENDPOINT
			);
			// Check if we have a match
			if (matching.length > 0) {
				return iface;
			}
		});

		if (matches.length == 1) {
			return matches[0];
		} else {
			throw new Error(`Unexpected number of matches found. Expected 1, found ${matches.length}.`);
		}
	}

	private async makeVendorRequest(value: number, len: number) {
		return await this.device.controlTransferIn(
			{
				requestType: "vendor",
				recipient: "endpoint",
				index: 3,
				request: 3,
				value,
			},
			len
		);
	}

	async getVersion() {
		// Check to see if the version has already been requested and 'cached'
		if (!this.version) {
			// Not in 'cache', request again.
			const vendorResponse = await this.makeVendorRequest(1, 128);
			this.version = new Version(vendorResponse);
		}

		// this.version is now available
		// (If the above block errors/fails it's promise will be rejected so we will not get here)
		return this.version;
	}

	async getBuildInfo() {
		// Check to see if the build info has already been requested and 'cached'
		if (!this.buildInfo) {
			// Not in 'cache', request again.
			const vendorResponse = await this.makeVendorRequest(2, 128);
			this.buildInfo = new BuildInfo(vendorResponse);
		}

		// this.buildInfo is now available
		// (If the above block errors/fails it's promise will be rejected so we will not get here)
		return this.buildInfo;
	}

	async getBoardInfo() {
		// Check to see if the build info has already been requested and 'cached'
		if (!this.boardInfo) {
			// Not in 'cache', request again.
			const vendorResponse = await this.makeVendorRequest(3, 128);
			this.boardInfo = new BoardInfo(vendorResponse);
		}

		// this.boardInfo is now available
		// (If the above block errors/fails it's promise will be rejected so we will not get here)
		return this.boardInfo;
	}
}
