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
        // ══ Regional & nearby flags ══
        FlagItem(id = "so", name = "Somalia", aliases = listOf("somalia", "so", "muqdisho", "mogadishu"), drawableResName = "", emoji = "\uD83C\uDDF8\uD83C\uDDF4"),
        FlagItem(id = "dj", name = "Djibouti", aliases = listOf("djibouti", "djibuti", "jabuuti"), drawableResName = "", emoji = "\uD83C\uDDE9\uD83C\uDDEF"),
        FlagItem(id = "et", name = "Ethiopia", aliases = listOf("ethiopia", "et", "addis"), drawableResName = "", emoji = "\uD83C\uDDEA\uD83C\uDDF9"),
        FlagItem(id = "ke", name = "Kenya", aliases = listOf("kenya", "ke", "nairobi"), drawableResName = "", emoji = "\uD83C\uDDF0\uD83C\uDDEA"),
        FlagItem(id = "er", name = "Eritrea", aliases = listOf("eritrea", "asmara"), drawableResName = "", emoji = "\uD83C\uDDEA\uD83C\uDDF7"),
        FlagItem(id = "ug", name = "Uganda", aliases = listOf("uganda", "kampala"), drawableResName = "", emoji = "\uD83C\uDDFA\uD83C\uDDEC"),
        FlagItem(id = "tz", name = "Tanzania", aliases = listOf("tanzania"), drawableResName = "", emoji = "\uD83C\uDDF9\uD83C\uDDFF"),
        // ══ Arab world ══
        FlagItem(id = "ae", name = "UAE", aliases = listOf("uae", "emirates", "dubai", "abu dhabi"), drawableResName = "", emoji = "\uD83C\uDDE6\uD83C\uDDEA"),
        FlagItem(id = "sa", name = "Saudi Arabia", aliases = listOf("saudi", "saudi arabia", "ksa", "riyadh"), drawableResName = "", emoji = "\uD83C\uDDF8\uD83C\uDDE6"),
        FlagItem(id = "qa", name = "Qatar", aliases = listOf("qatar", "doha"), drawableResName = "", emoji = "\uD83C\uDDF6\uD83C\uDDE6"),
        FlagItem(id = "kw", name = "Kuwait", aliases = listOf("kuwait"), drawableResName = "", emoji = "\uD83C\uDDF0\uD83C\uDDFC"),
        FlagItem(id = "bh", name = "Bahrain", aliases = listOf("bahrain"), drawableResName = "", emoji = "\uD83C\uDDE7\uD83C\uDDED"),
        FlagItem(id = "om", name = "Oman", aliases = listOf("oman", "muscat"), drawableResName = "", emoji = "\uD83C\uDDF4\uD83C\uDDF2"),
        FlagItem(id = "jo", name = "Jordan", aliases = listOf("jordan", "amman"), drawableResName = "", emoji = "\uD83C\uDDEF\uD83C\uDDF4"),
        FlagItem(id = "eg", name = "Egypt", aliases = listOf("egypt", "misr", "cairo"), drawableResName = "", emoji = "\uD83C\uDDEA\uD83C\uDDEC"),
        FlagItem(id = "ly", name = "Libya", aliases = listOf("libya", "tripoli"), drawableResName = "", emoji = "\uD83C\uDDF1\uD83C\uDDF8"),
        FlagItem(id = "tn", name = "Tunisia", aliases = listOf("tunisia", "tunis"), drawableResName = "", emoji = "\uD83C\uDDF9\uD83C\uDDF3"),
        FlagItem(id = "ma", name = "Morocco", aliases = listOf("morocco", "maroc"), drawableResName = "", emoji = "\uD83C\uDDF2\uD83C\uDDE6"),
        FlagItem(id = "tr", name = "Turkey", aliases = listOf("turkey", "turkiye", "istanbul"), drawableResName = "", emoji = "\uD83C\uDDF9\uD83C\uDDF7"),
        // ══ Global ══
        FlagItem(id = "us", name = "United States", aliases = listOf("united states", "usa", "america", "us"), drawableResName = "", emoji = "\uD83C\uDDFA\uD83C\uDDF8"),
        FlagItem(id = "gb", name = "United Kingdom", aliases = listOf("uk", "united kingdom", "britain", "england"), drawableResName = "", emoji = "\uD83C\uDDEC\uD83C\uDDE7"),
        FlagItem(id = "de", name = "Germany", aliases = listOf("germany", "deutschland"), drawableResName = "", emoji = "\uD83C\uDDE9\uD83C\uDDEA"),
        FlagItem(id = "fr", name = "France", aliases = listOf("france", "french", "paris"), drawableResName = "", emoji = "\uD83C\uDDEB\uD83C\uDDF7"),
        FlagItem(id = "cn", name = "China", aliases = listOf("china", "chinese", "beijing"), drawableResName = "", emoji = "\uD83C\uDDE8\uD83C\uDDF3"),
        FlagItem(id = "ng", name = "Nigeria", aliases = listOf("nigeria", "lagos"), drawableResName = "", emoji = "\uD83C\uDDF3\uD83C\uDDEC"),
        FlagItem(id = "za", name = "South Africa", aliases = listOf("south africa", "za", "joburg"), drawableResName = "", emoji = "\uD83C\uDDFF\uD83C\uDDE6"),
        FlagItem(id = "ww", name = "World", aliases = listOf("world", "earth", "globe", "international"), drawableResName = "", emoji = "\uD83C\uDF0D"),
        FlagItem(id = "un", name = "United Nations", aliases = listOf("united nations", "un", "peace"), drawableResName = "", emoji = "\uD83C\uDDFA\uD83C\uDDF3"),
    )

    fun search(query: String): List<FlagItem> {
        if (query.isBlank()) return flags
        val q = query.lowercase().trim()

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
