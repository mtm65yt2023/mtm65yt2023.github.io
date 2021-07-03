import { Socket } from "socket.io";

import { Color, Hat, Skin } from "@skeldjs/constant";

import {
	BackendModel,
	BackendType,
	CustomServerBackendModel,
	PublicLobbyBackendModel,
} from "./types/models/Backends";

import { GameSettings, HostOptions } from "./types/models/ClientOptions";

import { ClientSocketEvents } from "./types/enums/ClientSocketEvents";

import { ClientBase } from "./types/ClientBase";
import Room from "./Room";
import { state } from "./main";
import { PlayerFlag } from "./types/enums/PlayerFlags";
import { GameFlag } from "./types/enums/GameFlags";
import { GameState } from "./types/enums/GameState";
import { JOIN_TIMEOUT } from "./consts";

export interface PlayerPose {
	x: number;
	y: number;
}

export interface PlayerModel {
	clientId: number;
	position: PlayerPose;
	flags: Set<PlayerFlag>;
	name: string;
	color: Color;
	hat: Hat;
	skin: Skin;
	ventid: number;
}

export default class Client implements ClientBase {
	public socket: Socket;
	public room?: Room;

	public readonly uuid: string;

	public clientId: number;
	public name: string;

	private connected_at: number;

	constructor(socket: Socket, uuid: string) {
		this.socket = socket;
		this.uuid = uuid;
		this.clientId = 0;
		this.name = "";
		this.connected_at = 0;

		// Initialize socket events
		this.socket.on(
			ClientSocketEvents.RemoveClient,
			async (payload: { uuid: string; ban: boolean }) => {
				if (
					this.room &&
					this.room.clients &&
					this.clientId === this.room.hostclientId
				) {
					const client = this.room.clients.find(
						(member) => member.uuid === payload.uuid
					);
					if (client) {
						await this.room.removeClient(client, payload.ban);
					}
				}
			}
		);

		this.socket.on(ClientSocketEvents.Disconnect, async () => {
			await this.handleDisconnect();
		});

		this.socket.on(
			ClientSocketEvents.JoinRoom,
			async (payload: { name: string; backendModel: BackendModel }) => {
				// Prevent users from spamming the join button
				const current_time = Date.now();
				if (current_time - this.connected_at < JOIN_TIMEOUT) {
					this.sendError(
						"Already joining, please wait 5 seconds before pressing the join button again",
						false
					);
					return;
				}
				this.connected_at = current_time;

				await this.joinRoom(payload.name, payload.backendModel);
			}
		);

		this.socket.on(
			ClientSocketEvents.SetOptions,
			async (payload: { options: HostOptions }) => {
				if (this.room && this.clientId === this.room.hostclientId) {
					await this.room.setOptions(payload.options);
				}
			}
		);

		this.socket.emit(ClientSocketEvents.SetUuid, this.uuid);
	}

	async joinRoom(name: string, backendModel: BackendModel): Promise<void> {
		if (this.room) {
			await this.leaveRoom();
		}

		this.name = name;

		if (state.isClosing) {
			await this.sendError(
				"AUProximity is currently undergoing maintenence, please try again in a few minutes.",
				true
			);
			return;
		}

		let room = state.allRooms.find((room) => {
			if (room.backendModel.gameCode !== backendModel.gameCode) return false;

			if (
				room.backendModel.backendType === BackendType.Impostor &&
				backendModel.backendType === BackendType.Impostor
			) {
				return (
					(room.backendModel as CustomServerBackendModel).ip ===
					(backendModel as CustomServerBackendModel).ip
				);
			} else if (
				room.backendModel.backendType === BackendType.CustomServer &&
				backendModel.backendType === BackendType.CustomServer
			) {
				return (
					(room.backendModel as CustomServerBackendModel).ip ===
					(backendModel as CustomServerBackendModel).ip
				);
			} else if (
				room.backendModel.backendType === BackendType.PublicLobby &&
				backendModel.backendType === BackendType.PublicLobby
			) {
				return (
					(room.backendModel as PublicLobbyBackendModel).region ===
					(backendModel as PublicLobbyBackendModel).region
				);
			}
			return false;
		});

		if (!room) {
			room = new Room(backendModel);
			state.allRooms.push(room);
		}

		room.addClient(this);
		this.room = room;
	}

	async leaveRoom(): Promise<void> {
		this.name = "";
		if (!this.room) return;

		await this.room.removeClient(this, false);
		this.room = undefined;
	}

	async handleDisconnect(): Promise<void> {
		await this.leaveRoom();
		state.allClients = state.allClients.filter(
			(client) => client.uuid !== this.uuid
		);
	}

	sendError(err: string, fatal: boolean): void {
		this.socket.emit(ClientSocketEvents.Error, { err, fatal });
	}

	syncAllClients(array: ClientBase[]): void {
		this.socket.emit(ClientSocketEvents.SyncAllClients, array);
	}

	addClient(
		uuid: string,
		name: string,
		position: PlayerPose,
		flags: Set<PlayerFlag>,
		color: Color
	): void {
		this.socket.emit(ClientSocketEvents.AddClient, {
			uuid,
			name,
			position,
			flags: [...flags],
			color,
		});
	}

	removeClient(uuid: string, ban: boolean): void {
		this.socket.emit(ClientSocketEvents.RemoveClient, { uuid, ban });
	}

	setPoseOf(uuid: string, position: PlayerPose): void {
		this.socket.emit(ClientSocketEvents.SetPositionOf, { uuid, position });
	}

	setVentOf(uuid: string, ventid: number): void {
		this.socket.emit(ClientSocketEvents.SetVentOf, { uuid, ventid });
	}

	setNameOf(uuid: string, name: string): void {
		this.socket.emit(ClientSocketEvents.SetNameOf, { uuid, name });
	}

	setColorOf(uuid: string, color: Color): void {
		this.socket.emit(ClientSocketEvents.SetColorOf, { uuid, color });
	}

	setHatOf(uuid: string, hat: Hat): void {
		this.socket.emit(ClientSocketEvents.SetHatOf, { uuid, hat });
	}

	setSkinOf(uuid: string, skin: Skin): void {
		this.socket.emit(ClientSocketEvents.SetSkinOf, { uuid, skin });
	}

	setHost(uuid: string): void {
		this.socket.emit(ClientSocketEvents.SetHost, { uuid });
	}

	setOptions(options: HostOptions): void {
		this.socket.emit(ClientSocketEvents.SetOptions, { options });
	}

	setSettings(settings: GameSettings): void {
		this.socket.emit(ClientSocketEvents.SetSettings, { settings });
	}

	setGameState(state: GameState): void {
		this.socket.emit(ClientSocketEvents.SetGameState, { state });
	}

	setGameFlags(flags: Set<GameFlag>): void {
		this.socket.emit(ClientSocketEvents.SetGameFlags, { flags: [...flags] });
	}

	setFlagsOf(uuid: string, flags: Set<PlayerFlag>): void {
		this.socket.emit(ClientSocketEvents.SetFlagsOf, {
			uuid,
			flags: [...flags],
		});
	}
}
