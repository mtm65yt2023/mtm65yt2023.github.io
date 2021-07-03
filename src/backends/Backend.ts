import { Color, Hat, Skin } from "@skeldjs/constant";

import { EventEmitter } from "events";
import util from "util";
import chalk from "chalk";

import logger from "../util/logger";

import { BackendModel, BackendType } from "../types/models/Backends";
import { GameSettings } from "../types/models/ClientOptions";
import { BackendEvent } from "../types/enums/BackendEvents";
import { PlayerFlag } from "../types/enums/PlayerFlags";
import { GameState } from "../types/enums/GameState";
import { GameFlag } from "../types/enums/GameFlags";
import { PlayerPose } from "../Client";

export enum LogMode {
	Log = "log",
	Info = "info",
	Success = "success",
	Fatal = "fatal",
	Warn = "warn",
	Error = "error",
}

// Actual backend class
export abstract class BackendAdapter extends EventEmitter {
	abstract backendModel: BackendModel;
	destroyed: boolean;
	gameID: string;

	protected constructor() {
		super();
	}

	abstract initialize(): void;
	abstract destroy(): void;

	log(mode: LogMode, format: string, ...params: unknown[]): void {
		const formatted = util.format(format, ...params);

		logger[mode](
			chalk.grey(
				"[" +
					BackendType[this.backendModel.backendType] +
					" " +
					this.gameID +
					"]"
			),
			formatted
		);
	}

	emitPlayerPose(clientId: number, position: PlayerPose): void {
		this.emit(BackendEvent.PlayerPose, { clientId, position });
	}

	emitPlayerVent(clientId: number, ventid: number): void {
		this.emit(BackendEvent.PlayerVent, { clientId, ventid });
	}

	emitPlayerName(clientId: number, name: string): void {
		this.emit(BackendEvent.PlayerName, { clientId, name });
	}

	emitPlayerColor(clientId: number, color: Color): void {
		this.emit(BackendEvent.PlayerColor, { clientId, color });
	}

	emitPlayerHat(clientId: number, hat: Hat): void {
		this.emit(BackendEvent.PlayerHat, { clientId, hat });
	}

	emitPlayerSkin(clientId: number, skin: Skin): void {
		this.emit(BackendEvent.PlayerSkin, { clientId, skin });
	}

	emitPlayerFlags(clientId: number, flag: PlayerFlag, set: boolean): void {
		this.emit(BackendEvent.PlayerFlags, { clientId, flag, set });
	}

	emitHostChange(clientId: number): void {
		this.emit(BackendEvent.HostChange, { clientId });
	}

	emitGameState(state: GameState): void {
		this.emit(BackendEvent.GameState, { state });
	}

	emitGameFlags(flag: GameFlag, set: boolean): void {
		this.emit(BackendEvent.GameFlags, { flag, set });
	}

	emitSettingsUpdate(settings: GameSettings): void {
		this.emit(BackendEvent.SettingsUpdate, { settings });
	}

	emitError(err: string, fatal: boolean): void {
		this.emit(BackendEvent.Error, { err, fatal });
	}
}
