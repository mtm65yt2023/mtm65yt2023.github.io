import { Color, GameMap, Hat, Skin } from "@skeldjs/constant";

import { BackendEvent } from "./types/enums/BackendEvents";

import { GameSettings, HostOptions } from "./types/models/ClientOptions";

import {
	BackendType,
	BackendModel,
	CustomServerBackendModel,
	PublicLobbyBackendModel,
} from "./types/models/Backends";

import { BackendAdapter } from "./backends/Backend";

import ImpostorBackend from "./backends/ImpostorBackend";
import CustomServerBackend from "./backends/CustomServerBackend";
import PublicLobbyBackend from "./backends/PublicLobbyBackend";
import NoOpBackend from "./backends/NoOpBackend";

import Client, { PlayerModel, PlayerPose } from "./Client";
import { PlayerFlag } from "./types/enums/PlayerFlags";

import { state } from "./main";
import { GameState } from "./types/enums/GameState";
import { GameFlag } from "./types/enums/GameFlags";
import { sleep } from "./util/sleep";

const GameEndTimeout = 10 * 60 * 1000;

export default class Room {
	public backendModel: BackendModel;
	public backendAdapter: BackendAdapter;
	public clients: Client[] = [];
	public bans: Set<string> = new Set();

	map: GameMap;
	hostclientId: number;
	flags: Set<GameFlag>;
	state: GameState;
	options: HostOptions;
	settings: GameSettings;
	players: Map<number, PlayerModel>;

	constructor(backendModel: BackendModel) {
		this.backendModel = backendModel;
		this.backendAdapter = Room.buildBackendAdapter(backendModel);

		this.flags = new Set();
		this.state = GameState.Lobby;

		this.options = {
			falloff: 4.5,
			falloffVision: false,
			colliders: false,
			paSystems: true,
			commsSabotage: true,
			meetingsCommsSabotage: true,
		};

		this.settings = {
			crewmateVision: 1,
			map: GameMap.TheSkeld,
		};

		this.players = new Map();

		this.initializeBackend();
	}

	private static buildBackendAdapter(
		backendModel: BackendModel
	): BackendAdapter {
		if (backendModel.backendType === BackendType.PublicLobby) {
			return new PublicLobbyBackend(backendModel as PublicLobbyBackendModel);
		} else if (backendModel.backendType === BackendType.CustomServer) {
			return new CustomServerBackend(backendModel as CustomServerBackendModel);
		} else if (backendModel.backendType === BackendType.Impostor) {
			return new ImpostorBackend(backendModel as CustomServerBackendModel);
		} else {
			return new NoOpBackend();
		}
	}

	private initializeBackend() {
		this.backendAdapter.on(
			BackendEvent.PlayerPose,
			(payload: { clientId: number; position: PlayerPose; ventid: number }) => {
				const client = this.getClientByClientId(payload.clientId);

				if (client) {
					this.clients.forEach((c) => {
						c.setPoseOf(client.uuid, payload.position);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.PlayerVent,
			(payload: { clientId: number; ventid: number }) => {
				const client = this.getClientByClientId(payload.clientId);
				const player = this.getPlayerByClientId(payload.clientId);

				player.ventid = payload.ventid;

				if (client) {
					this.clients.forEach((c) => {
						c.setVentOf(client.uuid, payload.ventid);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.PlayerName,
			(payload: { clientId: number; name: string }) => {
				const client = this.getClientByName(payload.name);
				const player = this.getPlayerByClientId(payload.clientId);

				player.name = payload.name;

				if (client) {
					if (!client.clientId) {
						client.clientId = payload.clientId;
					}
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.PlayerColor,
			(payload: { clientId: number; color: Color }) => {
				const client = this.getClientByClientId(payload.clientId);
				const player = this.getPlayerByClientId(payload.clientId);

				player.color = payload.color;

				if (client) {
					this.clients.forEach((c) => {
						c.setColorOf(client.uuid, payload.color);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.PlayerHat,
			(payload: { clientId: number; hat: Hat }) => {
				const client = this.getClientByClientId(payload.clientId);
				const player = this.getPlayerByClientId(payload.clientId);

				player.hat = payload.hat;

				if (client) {
					this.clients.forEach((c) => {
						c.setHatOf(client.uuid, payload.hat);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.PlayerSkin,
			(payload: { clientId: number; skin: Skin }) => {
				const client = this.getClientByClientId(payload.clientId);
				const player = this.getPlayerByClientId(payload.clientId);

				player.skin = payload.skin;

				if (client) {
					this.clients.forEach((c) => {
						c.setSkinOf(client.uuid, payload.skin);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.HostChange,
			async (payload: { clientId: number }) => {
				const client = this.getClientByClientId(payload.clientId);
				this.hostclientId = payload.clientId;

				if (client) {
					this.clients.forEach((c) => {
						c.setHost(client.uuid);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.GameState,
			async (payload: { state: GameState }) => {
				this.state = payload.state;
				if (this.state === GameState.Lobby) {
					this.flags.clear();
					for (const [, player] of this.players) {
						player.flags.clear();
					}
				}

				this.clients.forEach((c) => {
					c.setGameState(this.state);
					for (const [clientId, player] of this.players) {
						const client = this.getClientByClientId(clientId);
						if (client) {
							c.setFlagsOf(client.uuid, player.flags);
						}
					}
				});
			}
		);

		this.backendAdapter.on(
			BackendEvent.SettingsUpdate,
			async (payload: { settings: GameSettings }) => {
				this.settings = payload.settings;

				this.clients.forEach((c) => {
					c.setSettings(payload.settings);
				});
			}
		);

		this.backendAdapter.on(
			BackendEvent.PlayerFlags,
			async (payload: { clientId: number; flag: PlayerFlag; set: boolean }) => {
				const client = this.getClientByClientId(payload.clientId);
				const player = this.getPlayerByClientId(payload.clientId);

				if (payload.set) {
					player.flags.add(payload.flag);
				} else {
					player.flags.delete(payload.flag);
				}

				if (client) {
					this.clients.forEach((c) => {
						c.setFlagsOf(client.uuid, player.flags);
					});
				}
			}
		);

		this.backendAdapter.on(
			BackendEvent.GameFlags,
			async (payload: { flag: GameFlag; set: boolean }) => {
				if (payload.set) {
					this.flags.add(payload.flag);
				} else {
					this.flags.delete(payload.flag);
				}

				this.clients.forEach((c) => {
					c.setGameFlags(this.flags);
				});
			}
		);

		this.backendAdapter.on(
			BackendEvent.Error,
			async (payload: { err: string; fatal: boolean }) => {
				this.clients.forEach((c) => {
					c.sendError(payload.err, payload.fatal);
				});

				if (payload.fatal) await this.destroy();
			}
		);

		this.backendAdapter.initialize();
	}

	getPlayerByClientId(clientId: number): PlayerModel {
		const found = this.players.get(clientId);

		if (found) {
			return found;
		}

		const player: PlayerModel = {
			clientId,
			position: { x: 0, y: 0 },
			flags: new Set(),
			name: "",
			color: -1,
			hat: Hat.None,
			skin: Skin.None,
			ventid: -1,
		};

		this.players.set(clientId, player);
		return player;
	}

	getPlayerByName(name: string): PlayerModel | undefined {
		for (const [, player] of this.players) {
			if (player.name === name) {
				return player;
			}
		}

		return undefined;
	}

	getClientByName(name: string): Client | undefined {
		return this.clients.find(
			(client) => client.name.toLowerCase().trim() === name.toLowerCase().trim()
		);
	}

	getClientByClientId(clientId: number): Client | undefined {
		return this.clients.find((client) => client.clientId === clientId);
	}

	addClient(client: Client): void {
		if (this.bans.has(client.socket.handshake.address)) {
			return client.removeClient(client.uuid, true);
		}

		const player = this.getPlayerByName(client.name);

		if (player) {
			client.clientId = player.clientId;
		}

		client.syncAllClients(
			this.clients.map((c) => ({
				uuid: c.uuid,
				name: c.name,
			}))
		);

		this.clients.forEach((c) => {
			if (player) {
				c.addClient(
					client.uuid,
					client.name,
					player.position,
					player.flags,
					player.color
				);
				c.setPoseOf(client.uuid, player.position);
				c.setColorOf(client.uuid, player.color);
			} else {
				c.addClient(client.uuid, client.name, { x: 0, y: 0 }, new Set(), 0);
			}

			if (this.hostclientId === client.clientId) {
				client.setHost(client.uuid);
			}

			const p = this.getPlayerByClientId(c.clientId);
			client.setColorOf(c.uuid, p.color);
			client.setPoseOf(c.uuid, p.position);
			client.setFlagsOf(c.uuid, p.flags);
		});

		this.clients.push(client);

		if (player) {
			client.setPoseOf(client.uuid, player.position);
			client.setNameOf(client.uuid, player.name);
			client.setColorOf(client.uuid, player.color);
			client.setHatOf(client.uuid, player.hat);
			client.setSkinOf(client.uuid, player.skin);
		}

		client.setGameState(this.state);
		client.setGameFlags(this.flags);
		client.setSettings(this.settings);

		const host = this.getClientByClientId(this.hostclientId);

		if (host) {
			client.setHost(host.uuid);
		}

		client.setOptions(this.options);
	}

	async removeClient(client: Client, ban: boolean): Promise<void> {
		this.clients.forEach((c) => c.removeClient(client.uuid, ban));
		this.clients = this.clients.filter((c) => c.uuid !== client.uuid);
		if (ban) {
			this.bans.add(client.socket.handshake.address);
		}
		if (this.clients.length === 0) await this.destroy();
	}

	setOptions(options: HostOptions, includeHost = false): void {
		this.options = options;

		this.clients.forEach((c) => {
			if (c.clientId !== this.hostclientId || includeHost)
				c.setOptions(options);
		});
	}

	private waitForEnd(): Promise<void> {
		return new Promise((resolve) => {
			// eslint-disable-next-line @typescript-eslint/no-this-alias
			const _this = this;
			this.backendAdapter.on(
				BackendEvent.GameState,
				async function onGameStateChange(payload: { state: GameState }) {
					if (payload.state === GameState.Lobby) {
						_this.backendAdapter.off(BackendEvent.GameState, onGameStateChange);
						resolve();
					}
				}
			);
		});
	}

	async gracefulDestroy(): Promise<void> {
		if (this.state !== GameState.Lobby) {
			this.clients.forEach((c) => {
				c.sendError(
					"AUProximity will be going into maintenance, you will not be able to start another game.",
					false
				);
			});

			await Promise.race([this.waitForEnd(), sleep(GameEndTimeout)]);
		}

		this.clients.forEach((c) => {
			c.sendError("Game closed for maintenance.", true);
		});

		await this.destroy();
	}

	async destroy(): Promise<void> {
		if (this.clients.length > 0) {
			for (const c of this.clients) {
				await c.leaveRoom();
			}
			return;
		}

		state.allRooms = state.allRooms.filter((room) => room !== this);

		if (this.backendAdapter.destroyed) return;

		await this.backendAdapter.destroy();
	}
}
