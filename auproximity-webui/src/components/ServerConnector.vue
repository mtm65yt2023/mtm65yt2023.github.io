<template>
	<div>
		<v-card class="pa-5">
			<v-form v-model="valid" @submit.prevent="joinRoom(name)">
				<v-text-field
					v-model="name"
					label="Name"
					:rules="[rules.required]"
					outlined
				></v-text-field>
				<v-text-field
					class="game-code"
					v-model="gameCode"
					label="Game Code"
					:rules="[rules.required, rules.counter6]"
					counter="6"
					maxlength="6"
					outlined
				></v-text-field>
				<v-select
					v-model="backendType"
					:items="items"
					item-text="backendName"
					item-value="backendType"
					:rules="[rules.required]"
					label="Server Backend"
					required
					outlined
				></v-select>
				<v-text-field
					v-if="backendType === 2 || backendType === 4"
					v-model="ip"
					label="Domain name (example.com) or IP Address of the server"
					:rules="[rules.required]"
					outlined
				></v-text-field>
				<v-select
					v-if="backendType === 1"
					v-model="publicLobbyRegion"
					:items="regions"
					item-text="regionName"
					item-value="regionType"
					label="Public Lobby Region"
					:rules="[rules.publicLobbyRegion]"
					required
					outlined
				></v-select>
				<v-btn :disabled="!valid" color="success" class="mr-4" type="submit">
					Join
				</v-btn>
				<v-btn
					:disabled="!valid"
					color="info"
					class="mr-4"
					@click="copyShareSlug"
				>
					Share URL
				</v-btn>
				<input :value="shareSlug" id="slug-share" />
			</v-form>
		</v-card>
		<JoinModal :game-code="gameCode" @joinroom="joinRoom($event)" />
		<v-snackbar v-model="showSnackbar"> Copied URL to clipboard! </v-snackbar>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import {
	BackendModel,
	BackendType,
	ImpostorBackendModel,
	PublicLobbyBackendModel,
	PublicLobbyRegion,
} from "@/models/BackendModel";
import JoinModal from "@/components/JoinModal.vue";

@Component({
	components: { JoinModal },
})
export default class ServerConnector extends Vue {
	valid = false;
	showSnackbar = false;

	name = "";
	gameCode = this.$route.params.gamecode
		? this.$route.params.gamecode.slice(0, 6)
		: "";

	// Backends
	// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
	// @ts-ignore
	backendType: BackendType =
		BackendType[this.$route.params.backend || "PublicLobby"] ||
		BackendType.PublicLobby;

	items = [
		{
			backendName: "Official Among Us Servers",
			backendType: BackendType.PublicLobby,
		},
		{
			backendName: "Impostor Private Server",
			backendType: BackendType.Impostor,
		},
	];

	// Impostor and NodePolus Backend
	ip = this.$route.params.region || "";

	// Public Lobby Backend
	// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
	// @ts-ignore
	publicLobbyRegion: PublicLobbyRegion =
		this.$route.params.region || PublicLobbyRegion.NorthAmerica;

	regionNames = {
		[PublicLobbyRegion.NorthAmerica]: "North America",
		[PublicLobbyRegion.Europe]: "Europe",
		[PublicLobbyRegion.Asia]: "Asia",
	};

	regions = [
		{
			regionName: "North America",
			regionType: PublicLobbyRegion.NorthAmerica,
		},
		{
			regionName: "Europe",
			regionType: PublicLobbyRegion.Europe,
		},
		{
			regionName: "Asia",
			regionType: PublicLobbyRegion.Asia,
		},
	];

	rules = {
		required(value: string) {
			return !!value || "Required.";
		},
		counter6(value: string) {
			return value.length === 6 || value.length === 4 || "Max 6 characters";
		},
		publicLobbyRegion(value: PublicLobbyRegion) {
			return Object.values(PublicLobbyRegion).includes(value);
		},
	};

	joinRoom(name: string) {
		this.name = name;
		const backendModel: BackendModel = {
			gameCode: this.gameCode.toUpperCase(),
			backendType: this.backendType,
		};
		if (this.backendType === BackendType.PublicLobby) {
			(backendModel as PublicLobbyBackendModel).region = this.publicLobbyRegion;
		} else if (this.backendType === BackendType.Impostor) {
			(backendModel as ImpostorBackendModel).ip = this.ip;
		}
		this.$emit("joinroom", {
			name,
			backendModel,
		});
	}

	copyShareSlug() {
		const copyText = document.getElementById("slug-share") as HTMLInputElement;

		copyText.select();
		copyText.setSelectionRange(0, 99999);

		document.execCommand("copy");
		this.showSnackbar = true;
	}

	get shareSlug() {
		if (this.backendType === BackendType.Impostor) {
			return (
				location.origin +
				"/" +
				BackendType[this.backendType] +
				"/" +
				this.ip +
				"/" +
				this.gameCode.toUpperCase()
			);
		} else if (this.backendType === BackendType.PublicLobby) {
			return (
				location.origin +
				"/" +
				BackendType[this.backendType] +
				"/" +
				this.publicLobbyRegion +
				"/" +
				this.gameCode.toUpperCase()
			);
		}
	}
}
</script>
<style lang="stylus">
#slug-share {
  position: absolute;
  left: -9999px
}
.game-code input {
  text-transform: uppercase;
}
</style>
