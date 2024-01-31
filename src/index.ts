import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import * as mysql from 'mysql2/promise';
import cron from 'node-cron';
import { Bounties, Regions, Skills } from './types';
import { servers, skillsMap } from './constants';

dotenv.config();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: true,
    },
};

const getEmoji = (skill: Skills) => {
    const getSkill = skillsMap.find((x) => x.name === skill.skills);
    if (getSkill) {
        if (getSkill.name === 'Content') {
            if (skill.subskills.includes('Video')) {
                return '🎥';
            }
            return '✍️';
        }
        return getSkill.emoji;
    }
    return '🤖';
};

const getRoleFromSkill = (name: string) => {
    const skill = skillsMap.find((x) => x.name === name);
    if (skill) return skill.roles;
};

client.once('ready', async () => {
    console.log(`⚡ Logged in as ${client.user.username}`);

    const today = new Date();
    const dayOfWeek = today.getDay();

    const cronTime = '0 0 * * 2,5';
    const sqlInterval = `INTERVAL ${dayOfWeek === 2 ? 4 : 3} DAY`;

    cron.schedule(
        cronTime,
        async () => {
            const connection = await mysql.createConnection(dbConfig);
            const [rows] = await connection.execute(
                `SELECT * FROM Bounties WHERE isPublished=1 AND isActive=1 AND isArchived=0 AND isPrivate=0 AND status='OPEN' AND publishedAt BETWEEN NOW() - ${sqlInterval} AND NOW() AND (hackathonId IS NULL OR hackathonId = '')`,
            );
            const bounties: Bounties[] = rows as Bounties[];

            if (bounties.length === 0) return;
            const roles: Set<string> = new Set();

            servers.map((server) => {
                let bountyMessage = bounties.length === 1 ? '' : `🚨 New Listing(s) Added on Earn!\n\n`;

                bounties.forEach((x) => {
                    if (x.region !== Regions.GLOBAL && x.region !== server.region) return;
                    x.skills.forEach((sk) => {
                        const skillRoles = getRoleFromSkill(sk.skills);
                        if (skillRoles !== null) {
                            skillRoles.forEach((role) => {
                                roles.add(role);
                            });
                        }
                    });
                    const emoji = getEmoji(x.skills[0]);

                    const link = `https://earn.superteam.fun/listings/${x.type}/${x.slug}/?utm_source=superteam&utm_medium=discord&utm_campaign=bounties`;
                    const modifiedLink = bounties.length === 1 ? link : `<${link}>`;

                    bountyMessage += `${emoji} ${x.title} (${x.token === 'USDC' ? '$' : ''}${x.rewardAmount.toLocaleString()}${x.token !== 'USDC' ? ` ${x.token}` : ''})\n🔗 ${modifiedLink}\n\n`;
                });

                const rolesArray = Array.from(roles);
                let sendMessage = bountyMessage;
                const guild = client.guilds.cache.get(server.id);
                if (guild) {
                    server.coreRoles.forEach((role) => {
                        if (rolesArray.length !== 0 && role.name === 'Member') return;
                        sendMessage += `${role.id} `;
                    });

                    const rolesAdded = new Set();
                    rolesArray.forEach((role) => {
                        const guildRole = server.roles.find((x) => x.name === role);
                        // Added check to prevent duplicate roles tag
                        if (guildRole && !rolesAdded.has(guildRole.id)) {
                            rolesAdded.add(guildRole.id);
                            sendMessage += `${guildRole.id} `;
                        }
                    });
                    const channel = guild.channels.cache.get(server.earn);
                    if (channel && channel.isTextBased()) {
                        channel.send(sendMessage);
                    }
                }
            });
        },
        {},
    );
});

client.login(process.env.DISCORD_TOKEN);
