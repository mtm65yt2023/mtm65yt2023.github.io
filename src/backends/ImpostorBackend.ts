import { Vector2 } from "@skeldjs/util";
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";
import _throttle from "lodash.throttle";

import { CustomServerBackendModel } from "../types/models/Backends";

import { CUSTOM_SERVER_PORT } from "../consts";

import { BackendAdapter, LogMode } from "./Backend";
import { GameSettings } from "../types/models/ClientOptions";
import { GameState } from "../types/enums/GameState";
import { PlayerFlag } from "../types/enums/PlayerFlags";
import { GameFlag } from "../types/enums/GameFlags";

export default class ImpostorBackend extends BackendAdapter {
	backendModel: CustomServerBackendModel;
	connection!: HubConnection;

	fakeClientIds: Map<string, number>;
	lastFakeClientId: number;

	constructor(backendModel: CustomServerBackendModel) {
		super();

		this.backendModel = backendModel;
		this.gameID = this.backendModel.ip + ":" + CUSTOM_SERVER_PORT;

		this.fakeClientIds = new Map();
		this.lastFakeClientId = 0;
	}

	throttledEmitPlayerMove = _throttle(this.emitPlayerPose, 300);

	getClientId(name: string): number {
		const cached = this.fakeClientIds.get(name);
		if (cached) return cached;

		const clientId = ++this.lastFakeClientId;
		this.fakeClientIds.set(name, clientId);
		return clientId;
	}

	async initialize(): Promise<void> {
		try {
			this.connection = new HubConnectionBuilder()
				.withUrl(`http://${this.backendModel.ip}:${CUSTOM_SERVER_PORT}/hub`)
				.build();

			this.connection.on(ImpostorSocketEvents.HostChange, (name: string) => {
				this.log(LogMode.Info, "Host changed to " + name + ".");
				const clientId = this.getClientId(name);
				this.emitHostChange(clientId);
			});

			this.connection.on(
				ImpostorSocketEvents.SettingsUpdate,
				(settings: GameSettings) => {
					this.emitSettingsUpdate(settings);
				}
			);

			this.connection.on(ImpostorSocketEvents.GameStarted, () => {
				this.emitGameState(GameState.Game);
			});

			this.connection.on(
				ImpostorSocketEvents.PlayerMove,
				(name: string, pose: Vector2) => {
					const clientId = this.getClientId(name);
					this.throttledEmitPlayerMove(clientId, pose);
				}
			);

			this.connection.on(ImpostorSocketEvents.MeetingCalled, () => {
				this.emitGameState(GameState.Meeting);
			});

			this.connection.on(ImpostorSocketEvents.PlayerExiled, (name: string) => {
				const clientId = this.getClientId(name);
				this.emitPlayerFlags(clientId, PlayerFlag.IsDead, true);
			});

			this.connection.on(ImpostorSocketEvents.CommsSabotage, (fix: boolean) => {
				if (fix) {
					this.log(LogMode.Info, "Communications was repaired.");
					this.emitGameFlags(GameFlag.CommsSabotaged, false);
				} else {
					this.log(LogMode.Info, "Communications was sabotaged.");
					this.emitGameFlags(GameFlag.CommsSabotaged, true);
				}
			});

			this.connection.on(ImpostorSocketEvents.GameEnd, () => {
				this.log(LogMode.Info, "Game ended.");
				this.emitGameState(GameState.Lobby);
			});

			this.log(
				LogMode.Info,
				`Impostor Backend initialized at http://${this.backendModel.ip}:${CUSTOM_SERVER_PORT}/hub`
			);
			try {
				await this.connection.start();
				this.connection.send(
					ImpostorSocketEvents.TrackGame,
					this.backendModel.gameCode
				);
			} catch (err) {
				this.log(LogMode.Error, `Error in ImpostorBackend: ${err}`);
			}
		} catch (err) {
			this.log(LogMode.Error, `Error in ImpostorBackend: ${err}`);
		}
	}

	async destroy(): Promise<void> {
		this.log(LogMode.Info, "Destroyed Impostor Backend.");
		return await this.connection.stop();
	}
}

export enum ImpostorSocketEvents {
	TrackGame = "TrackGame",
	HostChange = "HostChange",
	SettingsUpdate = "SettingsUpdate",
	GameStarted = "GameStarted",
	PlayerMove = "PlayerMove",
	MeetingCalled = "MeetingCalled",
	PlayerExiled = "PlayerExiled",
	CommsSabotage = "CommsSabotage",
	GameEnd = "GameEnd",
}
