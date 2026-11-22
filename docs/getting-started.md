# Getting started

This walkthrough uses Claude Code and a new channel called `field-notes`. You will finish with a local channel profile and a short synopsis. You can leave publishing accounts disconnected.

## Install and check the connection

Install Claude Code and Node.js 20 or later. From a terminal, add the marketplace and install the plugin. The plugin ships with its MCP server already built.

```sh
node --version
claude plugin marketplace add ttalkkaklab/social-flow
claude plugin install social-flow@social-flow
```

Create a workspace for your content. You can also use an existing project folder.

```sh
mkdir -p ~/Videos/field-notes
cd ~/Videos/field-notes
claude
```

In the new Claude Code session, enter `/mcp` and look for the connected **social-flow** server. Ask “Show the available project setup options using project_manage.” This reads the bundled options without creating project files. If skills appear but the tool is unavailable, check the connection before starting setup. [Troubleshooting](troubleshooting.md)

## Set up the channel

In the same session, run the following skill. Give it your chosen workspace path when prompted.

```text
/social-flow:project-init init ~/Videos/field-notes
```

Use `field-notes` as the channel slug. For this example, choose an English-language explainer in portrait format (`shorts-9x16`). The assistant asks which models you can use, how the channel should look and how many shots should use generated video. You can choose existing music or no new music, and skip separate text-to-speech when the project does not need it. Choose **connect later** for publishing accounts you want to add later. [Configuration and costs](configuration.md)

When setup finishes, look for `.social-flow/models.json` and `data/field-notes/profile.md`. The former holds workspace choices. The profile describes the channel's audience, tone and recurring cast. To see which choices still need an answer, run:

```text
/social-flow:project-init status ~/Videos/field-notes
```

## Request a first synopsis

Tell the assistant what the audience should learn and which artifact you want.

> For field-notes, draft a synopsis for a short called “Window Light.” Show a potter moving a cup from direct sunlight into diffuse window light so the viewer can see the glaze. Write in English and stop at the synopsis.

Read the proposed opening, what changes on screen and the final shot that proves the point. The synopsis can be revised before you request a storyboard. To continue with the same episode, follow [Making an episode](making-an-episode.md).

## Use Codex CLI

From a terminal, add the same marketplace and install the plugin:

```sh
codex plugin marketplace add ttalkkaklab/social-flow
codex plugin add social-flow@social-flow
```

Start a new Codex session in your content workspace. Ask it to show the available setup options using `project_manage`. Once the tool responds, request project setup in ordinary language and give it the workspace path. The slash commands above use Claude Code's syntax. If Codex loads the skills but cannot find the tool, check the MCP connection and bundle path in the [Codex manifest](../codex.mcp.json).

## Use a local checkout

To try a change from a clone, start Claude Code **in your content workspace** and pass the absolute path to the plugin checkout:

```sh
mkdir -p ~/src
git clone https://github.com/ttalkkaklab/social-flow.git ~/src/social-flow
claude --plugin-dir "$HOME/src/social-flow"
```

Build the server when you edit its TypeScript sources. The repository also contains manifests for other hosts and describes their setup separately. [Contributing](../CONTRIBUTING.md) · [Host installation options](../README.md#install)
