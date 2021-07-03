<template>
	<v-list-group>
		<template v-slot:activator>
			<v-list-item-icon>
				<v-icon :color="hexColor">fa-user</v-icon>
			</v-list-item-icon>
			<v-list-item-content>
				<v-list-item-title>
					<span class="float-left">
						<i v-if="mic.levels > 10" class="fas fa-volume-up"></i>
						<i v-else class="fas fa-volume-off"></i>
						<span class="pl-3">{{ client.name }}</span>
						<span v-if="$store.state.host && $store.state.host === client.uuid">
							(HOST)
						</span>
					</span>
					<span class="float-right" v-if="mic.volumeNode">
						<span class="px-3">Connected</span>
					</span>
					<span class="float-right" v-else-if="$store.state.micAllowed">
						<span class="px-3">Disconnected</span>
					</span>
					<span class="float-right" v-else>
						<span class="px-3">Mic Blocked</span>
					</span>
				</v-list-item-title>
			</v-list-item-content>
		</template>
		<v-slider
			v-if="mic.volumeNode"
			thumb-label
			v-model="streamVolume"
			track-color="grey"
			always-dirty
			min="0"
			max="100"
			class="px-3"
		>
			<template v-slot:prepend>
				<v-icon>fa-microphone-slash</v-icon>
			</template>

			<template v-slot:append>
				<v-icon>fa-microphone</v-icon>
			</template>
		</v-slider>
	</v-list-group>
</template>

<script lang="ts">
import { Component, Vue, Prop } from "vue-property-decorator";
import { ClientModel, MyMicModel } from "@/models/ClientModel";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ColorCodes } from "@skeldjs/data";

@Component({})
export default class MyClientListItem extends Vue {
	@Prop()
	client!: ClientModel;

	@Prop()
	mic!: MyMicModel;

	get streamVolume() {
		if (typeof this.mic.volumeNode !== "undefined") {
			return this.mic.volumeNode.gain.value * 100;
		}
		return undefined;
	}

	set streamVolume(val) {
		if (typeof this.mic.volumeNode !== "undefined") {
			this.mic.volumeNode.gain.value = val ? val / 100 : 0;
		}
	}

	get hexColor() {
		return (
			"#" +
			(ColorCodes[this.client.color]
				? ColorCodes[this.client.color].highlightHex
				: "ffffff")
		);
	}
}
</script>
