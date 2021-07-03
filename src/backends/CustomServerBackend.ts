import EventEmitter from "events";
import ch from "chalk";
import ws from "ws";

import * as skeldjs from "@skeldjs/core";
import { Code2Int } from "@skeldjs/util";

import { CUSTOM_SERVER_PORT } from "../consts";
import { CustomServerBackendModel } from "../types/models/Backends";
import { BackendAdapter, LogMode } from "./Backend";
import { GameState } from "../types/enums/GameState";
import { PlayerFlag } from "../types/enums/PlayerFlags";
import { GameFlag } from "../types/enums/GameFlags";

const chalk = new ch.Instance({ level: 2 });

export interface RecordedPlayer {
	clientId: number;
	name: string;
	color: number;
	hat: number;
	skin: number;
}

export default class CustomServerBackend extends BackendAdapter {
	socket?: ws;
	gotHello: boolean;

	eventEmitter: EventEmitter;
	backendModel: CustomServerBackendModel;

	recordedPlayers: Map<number, RecordedPlayer>;

	constructor(backendModel: CustomServerBackendModel) {
		super();

		this.gotHello = false;

		this.eventEmitter = new EventEmitter();
		this.backendModel = backendModel;
		this.gameID = this.backendModel.gameCode;

		this.recordedPlayers = new Map();
	}

	getOrCreatePlayer(clientId: number): RecordedPlayer {
		const player = this.recordedPlayers.get(clientId);

		if (player) {
			return player;
		}

		const newPlayer: RecordedPlayer = {
			clientId,
			name: "",
			color: 0,
			hat: skeldjs.Hat.None,
			skin: skeldjs.Skin.None,
		};

		this.recordedPlayers.set(clientId, newPlayer);
		return newPlayer;
	}

	fmtPlayer(clientId: number): string {
		const player = this.getOrCreatePlayer(clientId);

		const colour = player.color;
		const name = player.name || "<No Name>";
		const id = clientId || "<No ID>";

		const consoleClr: ch.Chalk = skeldjs.ColorCodes[
			colour as keyof typeof skeldjs.ColorCodes
		]?.highlightHex
			? chalk.hex(skeldjs.ColorCodes[colour].highlightHex)
			: chalk.gray;

		return consoleClr(name) + " " + chalk.grey("(" + id + ")");
	}

	initialize(): void {
		this.socket = new ws(
			"ws://" + this.backendModel.ip + ":" + CUSTOM_SERVER_PORT
		);

		this.socket.on("open", () => {
			this.socket?.send(
				JSON.stringify({
					op: TransportOp.Hello,
					d: {
						gameCode: Code2Int(this.backendModel.gameCode),
					},
				})
			);
		});

		this.socket.on("error", (err) => {
			this.log(
				LogMode.Warn,
				"An error occurred while attempting to connect to server:"
			);
			console.log(err);

			this.destroy();
		});

		this.socket.on("message", (buf) => {
			const data = buf.toString("utf8");
			try {
				const json = JSON.parse(data);

				try {
					if (json.d.gameCode === Code2Int(this.backendModel.gameCode)) {
						this.eventEmitter.emit(json.op, json.d);
					}
				} catch (e) {
					this.log(
						LogMode.Warn,
						"An error occurred while processing websocket message."
					);
					console.log(e);
				}
			} catch (e) {
				this.log(
					LogMode.Warn,
					"Received bad websocket message from %s: %s",
					this.backendModel.ip,
					data
				);
			}
		});

		this.eventEmitter.on(TransportOp.Error, (data) => {
			this.log(LogMode.Error, "An error occurred:", data.error);
			this.destroy();
		});

		this.eventEmitter.on(TransportOp.Destroy, () => {
			this.log(LogMode.Info, "The server destroyed the room.");
			this.destroy();
		});

		this.eventEmitter.on(TransportOp.HostUpdate, (data) => {
			this.log(
				LogMode.Info,
				"Host changed to %s",
				this.fmtPlayer(data.clientId)
			);

			this.emitHostChange(data.clientId);
		});

		this.eventEmitter.on(TransportOp.PlayerMove, (data) => {
			if (process.env.NODE_ENV !== "production") {
				this.log(
					LogMode.Info,
					this.fmtPlayer(data.clientId),
					"moved to X: " + data.x + ", Y: " + data.y
				);
			}

			this.emitPlayerPose(data.clientId, data);
		});

		this.eventEmitter.on(TransportOp.PlayerUpdate, (data) => {
			const player = this.getOrCreatePlayer(data.clientId);

			if ("name" in data) {
				player.name = data.name;
				this.emitPlayerName(data.clientId, player.name);
			}

			if ("color" in data) {
				player.color = data.color;
				this.emitPlayerColor(data.clientId, player.color);
			}

			if ("hat" in data) {
				player.hat = data.hat;
				this.emitPlayerHat(data.clientId, player.hat);
			}

			if ("skin" in data) {
				player.skin = data.skin;
				this.emitPlayerSkin(data.clientId, player.skin);
			}
		});

		this.eventEmitter.on(TransportOp.SettingsUpdate, (data) => {
			this.emitSettingsUpdate(data);
		});

		this.eventEmitter.on(TransportOp.GameStart, () => {
			this.emitGameState(GameState.Game);
		});

		this.eventEmitter.on(TransportOp.GameEnd, () => {
			this.emitGameState(GameState.Lobby);
		});

		this.eventEmitter.on(TransportOp.MeetingStart, () => {
			this.emitGameState(GameState.Meeting);
		});

		this.eventEmitter.on(TransportOp.MeetingEnd, (data) => {
			if (data.ejectedClientId)
				this.emitPlayerFlags(data.ejectedClientId, PlayerFlag.IsDead, true);

			this.emitGameState(GameState.Game);
		});

		this.eventEmitter.on(TransportOp.PlayerKill, (data) => {
			this.emitPlayerFlags(data.clientId, PlayerFlag.IsDead, true);
		});

		this.eventEmitter.on(TransportOp.ImpostorsUpdate, (data) => {
			for (const [clientId] of this.recordedPlayers) {
				this.emitPlayerFlags(clientId, PlayerFlag.IsImpostor, false);
			}
			for (const clientId of data.clientIds) {
				this.emitPlayerFlags(clientId, PlayerFlag.IsImpostor, true);
			}
		});

		this.eventEmitter.on(TransportOp.CamsPlayerJoin, (data) => {
			this.emitPlayerFlags(data.clientId, PlayerFlag.OnCams, true);
		});

		this.eventEmitter.on(TransportOp.CamsPlayerLeave, (data) => {
			this.emitPlayerFlags(data.clientId, PlayerFlag.OnCams, false);
		});

		this.eventEmitter.on(TransportOp.CommsSabotage, () => {
			this.emitGameFlags(GameFlag.CommsSabotaged, true);
		});

		this.eventEmitter.on(TransportOp.CommsRepair, () => {
			this.emitGameFlags(GameFlag.CommsSabotaged, false);
		});

		this.eventEmitter.on(TransportOp.PlayerVentEnter, (data) => {
			this.emitPlayerVent(data.clientId, data.ventId);
		});

		this.eventEmitter.on(TransportOp.PlayerVentExit, (data) => {
			this.emitPlayerVent(data.clientId, -1);
		});
	}

	destroy(): void {
		this.socket?.close();
	}
}

export enum IdentifyError {
	GameNotFound = "GAME_NOT_FOUND",
	AlreadyTracked = "ALREADY_TRACKED",
}

export enum TransportOp {
	Hello = "HELLO",
	Error = "ERROR",
	Destroy = "DESTROY",
	HostUpdate = "HOST_UPDATE",
	PlayerMove = "PLAYER_MOVE",
	PlayerUpdate = "PLAYER_UPDATE",
	SettingsUpdate = "SETTINGS_UPDATE",
	GameStart = "GAME_START",
	GameEnd = "GAME_END",
	MeetingStart = "MEETING_START",
	MeetingEnd = "MEETING_END",
	PlayerKill = "PLAYER_KILL",
	ImpostorsUpdate = "IMPOSTORS_UPDATE",
	CamsPlayerJoin = "CAMS_PLAYER_JOIN",
	CamsPlayerLeave = "CAMS_PLAYER_LEAVE",
	CommsSabotage = "COMMS_SABOTAGE",
	CommsRepair = "COMMS_REPAIR",
	PlayerVentEnter = "PlAYER_VENT_ENTER",
	PlayerVentExit = "PLAYER_VENT_EXIT",
}
