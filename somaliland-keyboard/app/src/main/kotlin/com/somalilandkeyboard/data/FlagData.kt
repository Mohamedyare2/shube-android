package com.somalilandkeyboard.data

data class FlagItem(
    val id: String,
    val name: String,
    val aliases: List<String>,
    val drawableResName: String = "",
    val emoji: String? = null,
)

object FlagData {
    val flags: List<FlagItem> = listOf(
        // ══ SOMALILAND — Featured First ══
        FlagItem(
            id = "somaliland",
            name = "Somaliland",
            aliases = listOf(
                "somaliland",
                "somaliland flag",
                "flag of somaliland",
                "jamhuuriyadda somaliland",
                "jamhuuriyadda",
                "sl",
                "sland",
                "somali",
                "hargeisa",
                "berbera",
                "borama",
                "burao",
                "ceerigaabo",
                "laascaanood",
            ),
            drawableResName = "flag_somaliland",
            emoji = "🟩⬜⭐🟥",
        ),
        FlagItem(
            id = "somaliland_hearts",
            name = "Somaliland (Hearts)",
            aliases = listOf(
                "somaliland hearts",
                "somaliland love",
                "calanka somaliland",
                "somaliland flag",
            ),
            drawableResName = "",
            emoji = "💚🤍⭐❤️",
        ),
        // ══ Regional & nearby flags ══
        FlagItem(id = "so", name = "Somalia", aliases = listOf("somalia", "so", "muqdisho", "mogadishu"), drawableResName = "", emoji = "🇸🇴"),
        FlagItem(id = "dj", name = "Djibouti", aliases = listOf("djibouti", "djibuti", "jabuuti"), drawableResName = "", emoji = "🇩🇯"),
        FlagItem(id = "et", name = "Ethiopia", aliases = listOf("ethiopia", "et", "addis"), drawableResName = "", emoji = "🇪🇹"),
        FlagItem(id = "ke", name = "Kenya", aliases = listOf("kenya", "ke", "nairobi"), drawableResName = "", emoji = "🇰🇪"),
        FlagItem(id = "er", name = "Eritrea", aliases = listOf("eritrea", "asmara"), drawableResName = "", emoji = "🇪🇷"),
        FlagItem(id = "ug", name = "Uganda", aliases = listOf("uganda", "kampala"), drawableResName = "", emoji = "🇺🇬"),
        FlagItem(id = "tz", name = "Tanzania", aliases = listOf("tanzania"), drawableResName = "", emoji = "🇹🇿"),
        // ══ Arab world ══
        FlagItem(id = "ae", name = "UAE", aliases = listOf("uae", "emirates", "dubai", "abu dhabi"), drawableResName = "", emoji = "🇦🇪"),
        FlagItem(id = "sa", name = "Saudi Arabia", aliases = listOf("saudi", "saudi arabia", "ksa", "riyadh"), drawableResName = "", emoji = "🇸🇦"),
        FlagItem(id = "qa", name = "Qatar", aliases = listOf("qatar", "doha"), drawableResName = "", emoji = "🇶🇦"),
        FlagItem(id = "kw", name = "Kuwait", aliases = listOf("kuwait"), drawableResName = "", emoji = "🇰🇼"),
        FlagItem(id = "bh", name = "Bahrain", aliases = listOf("bahrain"), drawableResName = "", emoji = "🇧🇭"),
        FlagItem(id = "om", name = "Oman", aliases = listOf("oman", "muscat"), drawableResName = "", emoji = "🇴🇲"),
        FlagItem(id = "jo", name = "Jordan", aliases = listOf("jordan", "amman"), drawableResName = "", emoji = "🇯🇴"),
        FlagItem(id = "eg", name = "Egypt", aliases = listOf("egypt", "misr", "cairo"), drawableResName = "", emoji = "🇪🇬"),
        FlagItem(id = "ly", name = "Libya", aliases = listOf("libya", "tripoli"), drawableResName = "", emoji = "🇱🇾"),
        FlagItem(id = "tn", name = "Tunisia", aliases = listOf("tunisia", "tunis"), drawableResName = "", emoji = "🇹🇳"),
        FlagItem(id = "ma", name = "Morocco", aliases = listOf("morocco", "maroc"), drawableResName = "", emoji = "🇲🇦"),
        FlagItem(id = "tr", name = "Turkey", aliases = listOf("turkey", "turkiye", "istanbul"), drawableResName = "", emoji = "🇹🇷"),
        // ══ Global ══
        FlagItem(id = "us", name = "United States", aliases = listOf("united states", "usa", "america", "us"), drawableResName = "", emoji = "🇺🇸"),
        FlagItem(id = "gb", name = "United Kingdom", aliases = listOf("uk", "united kingdom", "britain", "england"), drawableResName = "", emoji = "🇬🇧"),
        FlagItem(id = "de", name = "Germany", aliases = listOf("germany", "deutschland"), drawableResName = "", emoji = "🇩🇪"),
        FlagItem(id = "fr", name = "France", aliases = listOf("france", "french", "paris"), drawableResName = "", emoji = "🇫🇷"),
        FlagItem(id = "cn", name = "China", aliases = listOf("china", "chinese", "beijing"), drawableResName = "", emoji = "🇨🇳"),
        FlagItem(id = "ng", name = "Nigeria", aliases = listOf("nigeria", "lagos"), drawableResName = "", emoji = "🇳🇬"),
        FlagItem(id = "za", name = "South Africa", aliases = listOf("south africa", "za", "joburg"), drawableResName = "", emoji = "🇿🇦"),
        FlagItem(id = "ww", name = "World", aliases = listOf("world", "earth", "globe", "international"), drawableResName = "", emoji = "🌍"),
        FlagItem(id = "un", name = "United Nations", aliases = listOf("united nations", "un", "peace"), drawableResName = "", emoji = "🇺🇳"),
    )

    fun search(query: String): List<FlagItem> {
        if (query.isBlank()) return flags
        val q = query.lowercase().trim()

        // Priority: exact match on id/name, then alias exact, then starts-with, then contains
        val exactName = flags.filter { it.name.lowercase() == q || it.id == q }
        val exactAlias = flags.filter { it !in exactName && it.aliases.any { alias -> alias == q } }
        val startsWith = flags.filter {
            it !in exactName && it !in exactAlias && (
                it.name.lowercase().startsWith(q) ||
                it.aliases.any { alias -> alias.startsWith(q) }
            )
        }
        val contains = flags.filter {
            it !in exactName && it !in exactAlias && it !in startsWith && (
                it.name.lowercase().contains(q) ||
                it.aliases.any { alias -> alias.contains(q) }
            )
        }
        return exactName + exactAlias + startsWith + contains
    }
}
